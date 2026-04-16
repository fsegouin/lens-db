import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import type { EbayListing } from "@/lib/ebay-types";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 400;

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

async function getCameraRotationStats(staleBefore?: Date) {
  const [{ totalActiveCameras: totalActiveCamerasRaw }] = await db
    .select({
      totalActiveCameras: sql<number>`count(*)`,
    })
    .from(cameras)
    .where(isNull(cameras.mergedIntoId));

  const totalActiveCameras = Number(totalActiveCamerasRaw);

  if (!staleBefore) {
    return {
      batchSize: BATCH_SIZE,
      totalActiveCameras,
    };
  }

  const [{ outdatedCameras: outdatedCamerasRaw }] = await db
    .select({
      outdatedCameras: sql<number>`count(*)`,
    })
    .from(cameras)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'camera' AND ${priceEstimates.entityId} = ${cameras.id}`,
    )
    .where(
      sql`${cameras.mergedIntoId} IS NULL AND (
        ${priceEstimates.extractedAt} IS NULL OR ${priceEstimates.extractedAt} < ${staleBefore}
      )`,
    );

  const outdatedCameras = Number(outdatedCamerasRaw);

  return {
    batchSize: BATCH_SIZE,
    totalActiveCameras,
    outdatedCameras,
    estimatedRunsRemaining: Math.ceil(outdatedCameras / BATCH_SIZE),
  };
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

  const staleBeforeRaw = request.nextUrl.searchParams.get("staleBefore");
  let staleBefore: Date | undefined;

  if (staleBeforeRaw) {
    staleBefore = new Date(staleBeforeRaw);
    if (Number.isNaN(staleBefore.getTime())) {
      return NextResponse.json({ error: "Invalid staleBefore timestamp" }, { status: 400 });
    }
  }

  const cameraBatch = await getCameraBatch();
  const stats = await getCameraRotationStats(staleBefore);

  return NextResponse.json({ cameras: cameraBatch, stats });
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

  if (!cameraId || !cameraName) {
    return NextResponse.json({ error: "cameraId and cameraName required" }, { status: 400 });
  }

  console.log(`[ebay-prices] Processing ${cameraName}: ${listings?.length ?? 0} listings`);

  try {
    let stored = 0;
    let relevant = 0;

    if (listings?.length) {
      const classified = await classifyListings(cameraName, listings);
      const extractedAt = new Date().toISOString();
      stored = await storeClassifiedSales(
        "camera",
        cameraId,
        classified,
        listings,
        extractedAt,
      );
      relevant = classified.filter(
        (c) => c.isRelevant && c.conditionGrade !== "skip",
      ).length;
    }

    // Always upsert price_estimates to mark this camera as scraped
    // (even with 0 listings/stored, so we don't re-scrape it next run)
    await recomputePriceEstimates("camera", cameraId);

    console.log(`[ebay-prices]   ${cameraName}: Relevant: ${relevant}, Stored: ${stored}`);

    return NextResponse.json({ cameraName, listings: listings?.length ?? 0, relevant, stored });
  } catch (error) {
    console.error(`[ebay-prices] Error processing ${cameraName}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
