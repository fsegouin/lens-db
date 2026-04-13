import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, asc, desc } from "drizzle-orm";
import { searchSoldItems } from "@/lib/ebay-finding";
import { enrichListingsWithDescriptions } from "@/lib/ebay-browse";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 30;

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
      asc(priceEstimates.extractedAt).nullsFirst(),
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
  const results: { name: string; listings: number; relevant: number; stored: number }[] = [];
  let totalStored = 0;

  for (const camera of cameraBatch) {
    try {
      // 1. Fetch sold listings
      const soldListings = await searchSoldItems(camera.name);
      if (soldListings.length === 0) {
        results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
        continue;
      }

      // 2. Enrich with descriptions
      const enrichedListings = await enrichListingsWithDescriptions(soldListings);

      // 3. Classify via LLM
      const rawForClassify = enrichedListings.map((l) => ({
        title: l.title,
        price: l.price,
        date: l.date,
        condition: l.condition,
        description: l.description,
      }));
      const classified = await classifyListings(camera.name, rawForClassify);

      // 4. Store classified sales
      const rawForStorage = enrichedListings.map((l) => ({
        title: l.title,
        price: l.price,
        date: l.date,
        condition: l.condition,
        url: l.url,
      }));
      const extractedAt = new Date().toISOString();
      const stored = await storeClassifiedSales(
        "camera",
        camera.id,
        classified,
        rawForStorage,
        extractedAt,
      );

      // 5. Recompute price estimates
      if (stored > 0) {
        await recomputePriceEstimates("camera", camera.id);
      }

      const relevant = classified.filter(
        (c) => c.isRelevant && c.conditionGrade !== "skip",
      ).length;
      totalStored += stored;
      results.push({ name: camera.name, listings: soldListings.length, relevant, stored });
    } catch (error) {
      console.error(`Error processing ${camera.name}:`, error);
      results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
    }
  }

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    processed: cameraBatch.length,
    totalStored,
    cameras: results,
    durationMs,
  });
}
