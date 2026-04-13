import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import { EbayScraper } from "@/lib/ebay-finding";
import type { EbayListing } from "@/lib/ebay-finding";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 20;
const DELAY_BETWEEN_CAMERAS_MS = 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCameraBatch(): Promise<{ id: number; name: string; alias: string | null }[]> {
  const rows = await db
    .select({
      id: cameras.id,
      name: cameras.name,
      alias: cameras.alias,
      extractedAt: priceEstimates.extractedAt,
    })
    .from(cameras)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'camera' AND ${priceEstimates.entityId} = ${cameras.id}`,
    )
    .where(isNull(cameras.mergedIntoId))
    .orderBy(
      sql`${priceEstimates.extractedAt} ASC NULLS FIRST`,
      desc(cameras.viewCount),
    )
    .limit(BATCH_SIZE);

  return rows.map((r) => ({ id: r.id, name: r.name, alias: r.alias }));
}

/**
 * Classify + store + recompute for a single camera.
 * Runs concurrently with the next camera's scrape.
 */
async function processListings(
  camera: { id: number; name: string },
  listings: EbayListing[],
): Promise<{ relevant: number; stored: number }> {
  const classified = await classifyListings(camera.name, listings);

  const extractedAt = new Date().toISOString();
  const stored = await storeClassifiedSales(
    "camera",
    camera.id,
    classified,
    listings,
    extractedAt,
  );

  if (stored > 0) {
    await recomputePriceEstimates("camera", camera.id);
  }

  const relevant = classified.filter(
    (c) => c.isRelevant && c.conditionGrade !== "skip",
  ).length;

  return { relevant, stored };
}

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const cameraBatch = await getCameraBatch();
  console.log(`[ebay-prices] Starting batch of ${cameraBatch.length} cameras`);

  const results: { name: string; listings: number; relevant: number; stored: number }[] = [];
  let totalStored = 0;

  const scraper = new EbayScraper();
  await scraper.open();

  try {
    // Pipeline: scrape camera[i+1] while classifying camera[i]
    let pendingClassify: Promise<void> | null = null;

    for (let idx = 0; idx < cameraBatch.length; idx++) {
      const camera = cameraBatch[idx];

      // Wait for previous classification to finish before logging next camera
      if (pendingClassify) await pendingClassify;

      if (idx > 0) await delay(DELAY_BETWEEN_CAMERAS_MS);

      // Scrape this camera (and alias if available)
      let listings: EbayListing[] = [];
      try {
        listings = await scraper.scrape(camera.name);
        // If alias exists and primary search returned few results, also search alias
        if (camera.alias && listings.length < 5) {
          await delay(DELAY_BETWEEN_CAMERAS_MS);
          const aliasListings = await scraper.scrape(camera.alias);
          // Merge, dedup by itemId
          const seen = new Set(listings.map((l) => l.itemId));
          for (const l of aliasListings) {
            if (!seen.has(l.itemId)) listings.push(l);
          }
          listings = listings.slice(0, 20);
        }
      } catch (error) {
        console.error(`[ebay-prices] Error scraping ${camera.name}:`, error);
      }

      console.log(`[ebay-prices] ${idx + 1}/${cameraBatch.length} ${camera.name}: ${listings.length} listings`);

      if (listings.length === 0) {
        results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
        continue;
      }

      // Start classification in background — will overlap with next camera's scrape
      const capturedListings = listings;
      const capturedCamera = camera;
      pendingClassify = (async () => {
        try {
          const { relevant, stored } = await processListings(capturedCamera, capturedListings);
          totalStored += stored;
          console.log(`[ebay-prices]   ${capturedCamera.name}: Relevant: ${relevant}, Stored: ${stored}`);
          results.push({ name: capturedCamera.name, listings: capturedListings.length, relevant, stored });
        } catch (error) {
          console.error(`[ebay-prices]   Error classifying ${capturedCamera.name}:`, error);
          results.push({ name: capturedCamera.name, listings: capturedListings.length, relevant: 0, stored: 0 });
        }
      })();
    }

    // Wait for the last classification to finish
    if (pendingClassify) await pendingClassify;
  } finally {
    await scraper.close();
  }

  const durationMs = Date.now() - startTime;
  console.log(`[ebay-prices] Done: ${cameraBatch.length} cameras, ${totalStored} stored, ${Math.round(durationMs / 1000)}s`);

  return NextResponse.json({
    processed: cameraBatch.length,
    totalStored,
    cameras: results,
    durationMs,
  });
}
