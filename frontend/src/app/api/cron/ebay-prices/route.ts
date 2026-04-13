import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import { searchSoldListings } from "@/lib/ebay-finding";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 30;
const DELAY_BETWEEN_CAMERAS_MS = 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  for (let idx = 0; idx < cameraBatch.length; idx++) {
    const camera = cameraBatch[idx];

    // Rate limit: delay between cameras (skip first)
    if (idx > 0) await delay(DELAY_BETWEEN_CAMERAS_MS);

    try {
      // 1. Fetch sold listings
      console.log(`[ebay-prices] ${idx + 1}/${cameraBatch.length} Searching: ${camera.name}`);
      const soldListings = await searchSoldListings(camera.name);
      if (soldListings.length === 0) {
        console.log(`[ebay-prices]   No listings found`);
        results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
        continue;
      }

      // 2. Classify via LLM
      console.log(`[ebay-prices]   ${soldListings.length} listings, classifying...`);
      const classified = await classifyListings(camera.name, soldListings);

      // 3. Store classified sales
      const extractedAt = new Date().toISOString();
      const stored = await storeClassifiedSales(
        "camera",
        camera.id,
        classified,
        soldListings,
        extractedAt,
      );

      // 4. Recompute price estimates
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
      console.error(`Error processing ${camera.name}:`, error);
      results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
    }
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
