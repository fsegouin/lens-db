import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import type { EbayListing } from "@/lib/ebay-types";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 20;

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

export const maxDuration = 300;

/**
 * GET: Returns the next batch of cameras that need price updates.
 * Called by GitHub Action to know which cameras to scrape.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cameraBatch = await getCameraBatch();
  return NextResponse.json({ cameras: cameraBatch });
}

/**
 * POST: Receives scraped listings for a single camera, classifies, stores, recomputes.
 * Called by GitHub Action after scraping each camera.
 *
 * Body: { cameraId: number, cameraName: string, listings: EbayListing[] }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { cameraId, cameraName, listings } = body as {
    cameraId: number;
    cameraName: string;
    listings: EbayListing[];
  };

  if (!cameraId || !cameraName || !listings?.length) {
    return NextResponse.json({ error: "cameraId, cameraName, and listings required" }, { status: 400 });
  }

  console.log(`[ebay-prices] Processing ${cameraName}: ${listings.length} listings`);

  try {
    const classified = await classifyListings(cameraName, listings);

    const extractedAt = new Date().toISOString();
    const stored = await storeClassifiedSales(
      "camera",
      cameraId,
      classified,
      listings,
      extractedAt,
    );

    if (stored > 0) {
      await recomputePriceEstimates("camera", cameraId);
    }

    const relevant = classified.filter(
      (c) => c.isRelevant && c.conditionGrade !== "skip",
    ).length;

    console.log(`[ebay-prices]   ${cameraName}: Relevant: ${relevant}, Stored: ${stored}`);

    return NextResponse.json({ cameraName, listings: listings.length, relevant, stored });
  } catch (error) {
    console.error(`[ebay-prices] Error processing ${cameraName}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
