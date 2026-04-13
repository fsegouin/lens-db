import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
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
 * Call the isolated scrape function for a single camera name.
 * Each call is a separate serverless invocation with fresh memory.
 */
async function scrapeCamera(
  baseUrl: string,
  cameraName: string,
  secret: string | undefined,
): Promise<EbayListing[]> {
  const url = new URL("/api/cron/ebay-prices/scrape", baseUrl);
  url.searchParams.set("name", cameraName);

  const headers: Record<string, string> = {};
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return [];

  const data = await res.json();
  return data.listings ?? [];
}

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

  // Base URL for calling the scrape function
  const baseUrl = request.nextUrl.origin;

  const startTime = Date.now();
  const cameraBatch = await getCameraBatch();
  console.log(`[ebay-prices] Starting batch of ${cameraBatch.length} cameras`);

  const results: { name: string; listings: number; relevant: number; stored: number }[] = [];
  let totalStored = 0;

  // Pipeline: classify camera[i] while scraping camera[i+1]
  let pendingClassify: Promise<void> | null = null;

  for (let idx = 0; idx < cameraBatch.length; idx++) {
    const camera = cameraBatch[idx];

    if (pendingClassify) await pendingClassify;
    if (idx > 0) await delay(DELAY_BETWEEN_CAMERAS_MS);

    // Scrape via isolated function call (separate memory allocation)
    let listings: EbayListing[] = [];
    try {
      listings = await scrapeCamera(baseUrl, camera.name, cronSecret);
      // If alias exists and primary search returned few results, also search alias
      if (camera.alias && listings.length < 5) {
        const aliasListings = await scrapeCamera(baseUrl, camera.alias, cronSecret);
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

  if (pendingClassify) await pendingClassify;

  const durationMs = Date.now() - startTime;
  console.log(`[ebay-prices] Done: ${cameraBatch.length} cameras, ${totalStored} stored, ${Math.round(durationMs / 1000)}s`);

  return NextResponse.json({
    processed: cameraBatch.length,
    totalStored,
    cameras: results,
    durationMs,
  });
}
