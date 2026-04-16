import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import type { EbayListing } from "@/lib/ebay-types";
import type { ClassifiedListing } from "@/lib/price-classify";
import { classifyLensListings } from "@/lib/price-classify-lens";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 400;

async function getLensBatch(): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      extractedAt: priceEstimates.extractedAt,
    })
    .from(lenses)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'lens' AND ${priceEstimates.entityId} = ${lenses.id}`,
    )
    .where(isNull(lenses.mergedIntoId))
    .orderBy(
      sql`${priceEstimates.extractedAt} ASC NULLS FIRST`,
      desc(lenses.viewCount),
    )
    .limit(BATCH_SIZE);

  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function getLensRotationStats(staleBefore?: Date) {
  const [{ totalActiveLenses: totalActiveLensesRaw }] = await db
    .select({
      totalActiveLenses: sql<number>`count(*)`,
    })
    .from(lenses)
    .where(isNull(lenses.mergedIntoId));

  const totalActiveLenses = Number(totalActiveLensesRaw);

  if (!staleBefore) {
    return {
      batchSize: BATCH_SIZE,
      totalActiveLenses,
    };
  }

  const [{ outdatedLenses: outdatedLensesRaw }] = await db
    .select({
      outdatedLenses: sql<number>`count(*)`,
    })
    .from(lenses)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'lens' AND ${priceEstimates.entityId} = ${lenses.id}`,
    )
    .where(
      sql`${lenses.mergedIntoId} IS NULL AND (
        ${priceEstimates.extractedAt} IS NULL OR ${priceEstimates.extractedAt} < ${staleBefore}
      )`,
    );

  const outdatedLenses = Number(outdatedLensesRaw);

  return {
    batchSize: BATCH_SIZE,
    totalActiveLenses,
    outdatedLenses,
    estimatedRunsRemaining: Math.ceil(outdatedLenses / BATCH_SIZE),
  };
}

export const maxDuration = 300;

/**
 * GET: Returns the next batch of lenses that need price updates.
 * Called by GitHub Action to know which lenses to scrape.
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

  const lensBatch = await getLensBatch();
  const stats = await getLensRotationStats(staleBefore);

  return NextResponse.json({ lenses: lensBatch, stats });
}

/**
 * POST: Receives scraped listings for a single lens, classifies, stores, recomputes.
 * Called by GitHub Action after scraping each lens.
 *
 * Body: { lensId: number, lensName: string, listings: EbayListing[] }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { lensId, lensName, listings } = body as {
    lensId: number;
    lensName: string;
    listings: EbayListing[];
  };

  if (!lensId || !lensName) {
    return NextResponse.json({ error: "lensId and lensName required" }, { status: 400 });
  }

  console.log(`[ebay-lens-prices] Processing ${lensName}: ${listings?.length ?? 0} listings`);

  try {
    let stored = 0;
    let relevant = 0;

    if (listings?.length) {
      const classified = await classifyLensListings(lensName, listings);
      const extractedAt = new Date().toISOString();
      stored = await storeClassifiedSales(
        "lens",
        lensId,
        classified as unknown as ClassifiedListing[],
        listings,
        extractedAt,
      );
      relevant = classified.filter(
        (c) => c.isRelevant && c.conditionGrade !== "skip",
      ).length;
    }

    // Always upsert price_estimates to mark this lens as scraped
    // (even with 0 listings/stored, so we don't re-scrape it next run)
    await recomputePriceEstimates("lens", lensId);

    console.log(`[ebay-lens-prices]   ${lensName}: Relevant: ${relevant}, Stored: ${stored}`);

    return NextResponse.json({ lensName, listings: listings?.length ?? 0, relevant, stored });
  } catch (error) {
    console.error(`[ebay-lens-prices] Error processing ${lensName}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
