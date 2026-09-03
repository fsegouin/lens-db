import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import {
  lenses,
  cameras,
  ebayAskingSnapshots,
  ebayListingWatch,
} from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import {
  searchActiveListings,
  EbayApiError,
  type ActiveListing,
} from "@/lib/ebay-browse";
import { recomputePriceEstimates } from "@/lib/price-pipeline";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";

/**
 * Daily asking-price ingest over the Browse API.
 *
 * This replaces the scraped sold-listing pipeline that eBay's bot wall closed
 * in July. It costs exactly one API call per entity and runs server-side, so
 * there is no browser, no session, and nothing to be blocked.
 *
 * Two things are written per entity: a one-per-day asking aggregate, and a
 * watch row for a sample of the live listings. The watch rows are what make
 * real sold prices reachable later — see /api/cron/ebay-resolve.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Listings watched per entity per run. Recording all 200 would mean ~1.8M
 * pending rows across the catalogue and a resolve queue that could never be
 * drained inside eBay's daily call budget. The sample is spread evenly across
 * the price-sorted listings so the sales we eventually confirm keep the shape
 * of the distribution instead of clustering at one end.
 */
const WATCH_SAMPLE_PER_ENTITY = 20;

export const maxDuration = 300;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function spreadSample(listings: ActiveListing[], n: number): ActiveListing[] {
  if (listings.length <= n) return listings;
  const byPrice = [...listings].sort((a, b) => a.priceUsd - b.priceUsd);
  const step = byPrice.length / n;
  return Array.from({ length: n }, (_, i) => byPrice[Math.floor(i * step)]);
}

/**
 * The next entities due an asking snapshot, longest-unseen first.
 *
 * Ordering by staleness rather than popularity is what makes the rotation
 * fair: the catalogue is larger than a day's API budget, so a most-viewed-
 * first order would re-poll the same head every morning and never reach the
 * tail. View count only breaks ties between equally stale entities.
 */
async function getBatch(entityType: "lens" | "camera", limit: number) {
  const table = entityType === "lens" ? lenses : cameras;
  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .leftJoin(
      ebayAskingSnapshots,
      sql`${ebayAskingSnapshots.entityType} = ${entityType}
          AND ${ebayAskingSnapshots.entityId} = ${table.id}`,
    )
    .where(isNull(table.mergedIntoId))
    .groupBy(table.id, table.name, table.viewCount)
    .having(
      sql`max(${ebayAskingSnapshots.observedOn}) IS NULL
          OR max(${ebayAskingSnapshots.observedOn}) < CURRENT_DATE`,
    )
    .orderBy(
      sql`max(${ebayAskingSnapshots.observedOn}) ASC NULLS FIRST`,
      desc(table.viewCount),
    )
    .limit(limit);
}

/** How many entities are still awaiting today's snapshot. */
async function countDue(entityType: "lens" | "camera"): Promise<number> {
  const table = entityType === "lens" ? lenses : cameras;
  const due = await db
    .select({ id: table.id })
    .from(table)
    .leftJoin(
      ebayAskingSnapshots,
      sql`${ebayAskingSnapshots.entityType} = ${entityType}
          AND ${ebayAskingSnapshots.entityId} = ${table.id}`,
    )
    .where(isNull(table.mergedIntoId))
    .groupBy(table.id)
    .having(
      sql`max(${ebayAskingSnapshots.observedOn}) IS NULL
          OR max(${ebayAskingSnapshots.observedOn}) < CURRENT_DATE`,
    );
  return due.length;
}

async function ingestOne(
  entityType: "lens" | "camera",
  entityId: number,
  name: string,
): Promise<{ sampled: number; total: number; median: number | null }> {
  const query =
    entityType === "lens"
      ? buildEbayLensSearchQuery(name)
      : buildEbaySearchQuery(name);

  const { listings, total } = await searchActiveListings(query);

  const prices = listings.map((l) => l.priceUsd).sort((a, b) => a - b);
  const median = percentile(prices, 0.5);
  const observedOn = new Date().toISOString().slice(0, 10);

  const snapshot = {
    medianUsd: median == null ? null : Math.round(median),
    p25Usd: (v => (v == null ? null : Math.round(v)))(percentile(prices, 0.25)),
    p75Usd: (v => (v == null ? null : Math.round(v)))(percentile(prices, 0.75)),
    sampleCount: prices.length,
    totalAvailable: total,
  };

  // Re-running the same day corrects the day's figures rather than adding a
  // second point, which is what keeps the chart to one entry per day.
  await db
    .insert(ebayAskingSnapshots)
    .values({ entityType, entityId, observedOn, ...snapshot })
    .onConflictDoUpdate({
      target: [
        ebayAskingSnapshots.entityType,
        ebayAskingSnapshots.entityId,
        ebayAskingSnapshots.observedOn,
      ],
      set: snapshot,
    });

  const sample = spreadSample(listings, WATCH_SAMPLE_PER_ENTITY);
  if (sample.length > 0) {
    await db
      .insert(ebayListingWatch)
      .values(
        sample.map((l) => ({
          entityType,
          entityId,
          legacyItemId: l.legacyItemId,
          title: l.title.slice(0, 200),
          condition: l.condition,
          askingPriceUsd: Math.round(l.priceUsd),
        })),
      )
      // Already watching it: keep the original first_seen_at, which is what
      // dates the listing's life.
      .onConflictDoNothing({
        target: [
          ebayListingWatch.entityType,
          ebayListingWatch.entityId,
          ebayListingWatch.legacyItemId,
        ],
      });
  }

  await recomputePriceEstimates(entityType, entityId);
  return { sampled: prices.length, total, median };
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const entityType = params.get("entityType") === "camera" ? "camera" : "lens";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT),
  );

  const batch = await getBatch(entityType, limit);

  let processed = 0;
  let withListings = 0;
  let failed = 0;
  let rateLimited = false;

  for (const entity of batch) {
    try {
      const result = await ingestOne(entityType, entity.id, entity.name);
      processed++;
      if (result.sampled > 0) withListings++;
    } catch (error) {
      // A quota refusal means every remaining call fails too, so stop rather
      // than burn the rest of the batch generating identical errors.
      if (error instanceof EbayApiError && (error.status === 429 || error.status === 403)) {
        rateLimited = true;
        console.error(`[ebay-asking] eBay refused (${error.status}); stopping run`);
        break;
      }
      failed++;
      console.error(`[ebay-asking] ${entity.name}:`, error);
    }
  }

  return NextResponse.json({
    entityType,
    requested: batch.length,
    processed,
    withListings,
    failed,
    rateLimited,
    remainingToday: await countDue(entityType),
  });
}
