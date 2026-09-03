import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import {
  lenses,
  cameras,
  ebayAskingSnapshots,
  ebayListingWatch,
} from "@/db/schema";
import { sql, isNull, desc, and, eq, inArray } from "drizzle-orm";
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
 * Listings watched per entity, derived from the call budget rather than
 * picked by feel.
 *
 * eBay allows 5,000 Browse calls a day. Reserving ~500 for the listings shown
 * on entity pages and sweeping the 11,486-entity catalogue weekly costs ~1,640
 * searches a day, leaving ~2,850 for resolves. A watched listing needs one
 * resolve call when it ends, and used camera gear sits listed for roughly 45
 * days, so the sustainable watch set is about 2,850 x 45 = 128,000 listings,
 * or ~11 per entity on average. Most entities have fewer live listings than
 * any cap, so the cap only binds on the popular ones; 30 leaves those better
 * covered while keeping the total near budget.
 *
 * The right number is measurable rather than estimated: every snapshot records
 * `totalAvailable`, so after one full sweep the real distribution can replace
 * the 45-day assumption behind this figure.
 */
const WATCH_CAP_PER_ENTITY = 30;

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

  await syncWatchList(entityType, entityId, listings, total);
  await recomputePriceEstimates(entityType, entityId);
  return { sampled: prices.length, total, median };
}

/**
 * Reconcile what we are watching for one entity against what the search just
 * returned.
 *
 * This is where sales are detected. A watched listing that stops coming back
 * has ended, and marking it here means the resolve pass spends a call only on
 * listings that might be a sale, instead of re-checking live ones on a timer.
 */
async function syncWatchList(
  entityType: "lens" | "camera",
  entityId: number,
  listings: ActiveListing[],
  total: number,
): Promise<void> {
  const now = new Date();
  const seenIds = new Set(listings.map((l) => l.legacyItemId));

  const existing = await db
    .select({ legacyItemId: ebayListingWatch.legacyItemId })
    .from(ebayListingWatch)
    .where(
      and(
        eq(ebayListingWatch.entityType, entityType),
        eq(ebayListingWatch.entityId, entityId),
        isNull(ebayListingWatch.resolution),
      ),
    );
  const watchedIds = new Set(existing.map((r) => r.legacyItemId));

  // Still listed. Clearing disappearedAt matters: eBay's result pages shuffle,
  // so a listing can drop out of one search and come back in the next, and a
  // returning listing must leave the resolve queue rather than burn a call.
  const stillListed = [...seenIds].filter((id) => watchedIds.has(id));
  if (stillListed.length > 0) {
    await db
      .update(ebayListingWatch)
      .set({ lastSeenActiveAt: now, disappearedAt: null })
      .where(
        and(
          eq(ebayListingWatch.entityType, entityType),
          eq(ebayListingWatch.entityId, entityId),
          inArray(ebayListingWatch.legacyItemId, stillListed),
        ),
      );
  }

  // Gone. Only meaningful when this search saw the whole pool: the API returns
  // at most 200 matches, and on anything larger a listing can fall off the
  // page while still being perfectly alive. Those keep resolving on the timer.
  const sawWholePool = total <= listings.length;
  const vanished = sawWholePool
    ? [...watchedIds].filter((id) => !seenIds.has(id))
    : [];
  if (vanished.length > 0) {
    await db
      .update(ebayListingWatch)
      .set({ disappearedAt: now })
      .where(
        and(
          eq(ebayListingWatch.entityType, entityType),
          eq(ebayListingWatch.entityId, entityId),
          isNull(ebayListingWatch.resolution),
          isNull(ebayListingWatch.disappearedAt),
          inArray(ebayListingWatch.legacyItemId, vanished),
        ),
      );
  }

  // New listings, up to the per-entity cap. Sampled across the price-sorted
  // set so a capped entity keeps the shape of its distribution rather than
  // only its cheapest or dearest listings.
  const room = WATCH_CAP_PER_ENTITY - watchedIds.size;
  if (room <= 0) return;
  const fresh = listings.filter((l) => !watchedIds.has(l.legacyItemId));
  const toAdd = spreadSample(fresh, room);
  if (toAdd.length === 0) return;

  await db
    .insert(ebayListingWatch)
    .values(
      toAdd.map((l) => ({
        entityType,
        entityId,
        legacyItemId: l.legacyItemId,
        title: l.title.slice(0, 200),
        condition: l.condition,
        askingPriceUsd: Math.round(l.priceUsd),
        lastSeenActiveAt: now,
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

  // A single entity can be re-ingested on demand, which is the only way to
  // refresh one without waiting for it to come round in the rotation.
  const onlyId = Number(params.get("entityId")) || null;
  const batch = onlyId
    ? await db
        .select({
          id: entityType === "lens" ? lenses.id : cameras.id,
          name: entityType === "lens" ? lenses.name : cameras.name,
        })
        .from(entityType === "lens" ? lenses : cameras)
        .where(eq(entityType === "lens" ? lenses.id : cameras.id, onlyId))
        .limit(1)
    : await getBatch(entityType, limit);

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
