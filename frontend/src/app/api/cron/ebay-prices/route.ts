import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import { searchSoldListingsBatch } from "@/lib/ebay-finding";
import type { EbayListing } from "@/lib/ebay-finding";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 30;
const DELAY_BETWEEN_CAMERAS_MS = 2000;

async function getCameraBatch(): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({
      id: cameras.id,
      name: cameras.name,
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

  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify cron secret
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
  let idx = 0;

  await searchSoldListingsBatch(
    cameraBatch,
    async (camera: { id: number; name: string }, soldListings: EbayListing[]) => {
      idx++;
      console.log(`[ebay-prices] ${idx}/${cameraBatch.length} ${camera.name}: ${soldListings.length} listings`);

      if (soldListings.length === 0) {
        results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
        return;
      }

      try {
        // Classify via LLM
        const classified = await classifyListings(camera.name, soldListings);

        // Store classified sales
        const extractedAt = new Date().toISOString();
        const stored = await storeClassifiedSales(
          "camera",
          camera.id,
          classified,
          soldListings,
          extractedAt,
        );

        // Recompute price estimates
        if (stored > 0) {
          await recomputePriceEstimates("camera", camera.id);
        }

        const relevant = classified.filter(
          (c) => c.isRelevant && c.conditionGrade !== "skip",
        ).length;
        totalStored += stored;
        console.log(`[ebay-prices]   Relevant: ${relevant}, Stored: ${stored}`);
        results.push({ name: camera.name, listings: soldListings.length, relevant, stored });
      } catch (error) {
        console.error(`[ebay-prices]   Error classifying ${camera.name}:`, error);
        results.push({ name: camera.name, listings: soldListings.length, relevant: 0, stored: 0 });
      }
    },
    DELAY_BETWEEN_CAMERAS_MS,
  );

  const durationMs = Date.now() - startTime;
  console.log(`[ebay-prices] Done: ${cameraBatch.length} cameras, ${totalStored} stored, ${Math.round(durationMs / 1000)}s`);

  return NextResponse.json({
    processed: cameraBatch.length,
    totalStored,
    cameras: results,
    durationMs,
  });
}
