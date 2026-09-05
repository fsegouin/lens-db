import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import {
  lenses,
  cameras,
  ebayAskingSnapshots,
  ebayListingWatch,
  ebayListingVerdicts,
} from "@/db/schema";
import { sql, isNull, desc, and, eq, inArray, lt } from "drizzle-orm";
import {
  searchActiveListings,
  getBrowseQuota,
  EbayApiError,
  type ActiveListing,
} from "@/lib/ebay-browse";
import { recomputePriceEstimates } from "@/lib/price-pipeline";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";
import { classifyRelevance } from "@/lib/price-classify-relevance";

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

/**
 * Listings put through the relevance classifier per entity.
 *
 * Everything stored here passes the same LLM check the scraped pipeline used,
 * because a keyword search is not a model match: "Canon EF" is a 1973 body but
 * the query pulls in every EF-mount lens on the site, "Sony a7" matches every
 * a7 variant, and without a filter those all land in the median. The first run
 * without one published a Canon EF at $100.
 *
 * Bounded at 20, which is one batch. A median does not get meaningfully
 * better from forty listings than twenty, and the second batch doubled both
 * the bill and the time an entity held the request open.
 */
const CLASSIFY_SAMPLE = 20;

/**
 * Mirrors the floor the sold estimator applies. Anything under this is a cap,
 * a box, a filter listed under the lens's name, or a mis-read amount, and one
 * of them at the bottom of a thin sample drags the whole range down.
 */
const MIN_PLAUSIBLE_USD = 5;

/** Relevant listings below which a camera's alias is worth a second search. */
const ALIAS_SEARCH_THRESHOLD = 5;

/**
 * How long a daily asking snapshot is kept.
 *
 * The chart is the only thing that reads more than the newest row, and it
 * reads the trailing year, so beyond that a snapshot is read by nothing at
 * all. The extra five weeks are margin rather than slack: they keep the far
 * end of a year-long chart from being clipped by a sweep that ran late.
 *
 * Without this the table grows forever. Every entity is swept about weekly,
 * so the catalogue produces roughly 600,000 rows a year, and on a 500 MB
 * database that is not something to leave unbounded.
 */
const SNAPSHOT_RETENTION_DAYS = 400;

/**
 * Browse calls held back for the listings shown on entity pages.
 *
 * The pipeline and the site draw on one shared daily allowance, and the site
 * is the half a visitor notices. Reading the remaining figure costs nothing
 * against it (the analytics endpoint has its own allowance), so the pipeline
 * can check before every batch and stop while there is still enough left for
 * a day's page views rather than discovering the ceiling by hitting it.
 */
const QUOTA_RESERVED_FOR_SITE = 400;

/**
 * How long a classifier verdict is remembered. Listings run for weeks and are
 * resolvable for months after they end, but a verdict on one that has been
 * gone this long will never be asked for again.
 */
const VERDICT_RETENTION_DAYS = 180;

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
    .select({
      id: table.id,
      name: table.name,
      // Cameras carry a second name they were sold under in other markets
      // (16 of them do). The scraped pipeline searched it when the primary
      // name came back thin, and dropping that would quietly lose those.
      alias: entityType === "camera" ? cameras.alias : sql<string | null>`NULL`,
    })
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

/** A listing the classifier accepted, carrying the grade it assigned. */
interface RelevantListing {
  listing: ActiveListing;
  grade: string | null;
}

/**
 * Drop everything that is not actually this entity, in working order, sold on
 * its own, judged by the same rules the scraped pipeline used but through a
 * classifier that returns only what this path reads.
 *
 * The classifier throws when every batch fails, and that is deliberate: an
 * unclassified sample must not be stored, because "no relevant listings" and
 * "the classifier was down" would otherwise look identical and the entity
 * would be marked done on the strength of a check that never ran.
 */
interface RelevanceResult {
  kept: RelevantListing[];
  /** Listings answered from the verdict cache, costing nothing. */
  cached: number;
  /** Listings that had to be sent to the classifier. */
  classified: number;
}

async function keepRelevant(
  entityType: "lens" | "camera",
  entityId: number,
  name: string,
  listings: ActiveListing[],
): Promise<RelevanceResult> {
  if (listings.length === 0) return { kept: [], cached: 0, classified: 0 };

  // Anything judged before is judged. A listing lives for weeks and the same
  // entity is swept every few days, so without this the same listings are
  // bought from the model over and over for the same answer.
  const ids = listings.map((l) => l.legacyItemId);
  const remembered = await db
    .select({
      legacyItemId: ebayListingVerdicts.legacyItemId,
      isRelevant: ebayListingVerdicts.isRelevant,
      grade: ebayListingVerdicts.grade,
    })
    .from(ebayListingVerdicts)
    .where(
      and(
        eq(ebayListingVerdicts.entityType, entityType),
        eq(ebayListingVerdicts.entityId, entityId),
        inArray(ebayListingVerdicts.legacyItemId, ids),
      ),
    );

  const known = new Map(
    remembered.map((r) => [r.legacyItemId, { isRelevant: r.isRelevant, grade: r.grade }]),
  );

  const unseen = listings.filter((l) => !known.has(l.legacyItemId));
  if (unseen.length > 0) {
    const verdicts = await classifyRelevance(
      entityType,
      name,
      unseen.map((l) => ({
        title: l.title,
        price: l.priceUsd,
        condition: l.condition,
      })),
    );

    // Every answer missing means the classifier is down, and an entity must
    // not be recorded on the strength of a check that never ran. Throwing
    // leaves it due for the next sweep.
    if (verdicts.every((v) => v == null)) {
      throw new Error(`Classifier returned nothing for "${name}"`);
    }

    const fresh = [];
    for (let i = 0; i < unseen.length; i++) {
      const v = verdicts[i];
      if (!v) continue; // unanswered: leave unknown rather than caching a guess
      known.set(unseen[i].legacyItemId, v);
      fresh.push({
        entityType,
        entityId,
        legacyItemId: unseen[i].legacyItemId,
        isRelevant: v.isRelevant,
        grade: v.grade,
      });
    }
    if (fresh.length > 0) {
      await db
        .insert(ebayListingVerdicts)
        .values(fresh)
        .onConflictDoNothing({
          target: [
            ebayListingVerdicts.entityType,
            ebayListingVerdicts.entityId,
            ebayListingVerdicts.legacyItemId,
          ],
        });
    }
  }

  const kept: RelevantListing[] = [];
  for (const l of listings) {
    const v = known.get(l.legacyItemId);
    if (v?.isRelevant) kept.push({ listing: l, grade: v.grade });
  }
  return {
    kept,
    cached: listings.length - unseen.length,
    classified: unseen.length,
  };
}

async function ingestOne(
  entityType: "lens" | "camera",
  entityId: number,
  name: string,
  alias: string | null,
): Promise<{
  sampled: number;
  total: number;
  median: number | null;
  cached: number;
  classified: number;
}> {
  const buildQuery = (n: string) =>
    entityType === "lens" ? buildEbayLensSearchQuery(n) : buildEbaySearchQuery(n);

  const { listings, total: rawTotal } = await searchActiveListings(buildQuery(name));

  // Spread the classified sample across the price-sorted results so the
  // relevance rate is measured over the whole range, not just the cheap end.
  const sample = spreadSample(listings, CLASSIFY_SAMPLE);
  const primary = await keepRelevant(entityType, entityId, name, sample);
  let relevant = primary.kept;
  let cached = primary.cached;
  let classified = primary.classified;
  let total = rawTotal;
  // Listings put through relevance judging, whether answered from cache or by
  // the model. This is the denominator for the relevance rate and the measure
  // of how much of the pool we actually saw, so it counts both.
  let examined = sample.length;

  // A camera sold under a second name can be nearly invisible under its
  // primary one, so fall back to the alias when the first search comes back
  // thin. Costs an extra call only for the handful of cameras that need it.
  if (alias && relevant.length < ALIAS_SEARCH_THRESHOLD) {
    const aliasSearch = await searchActiveListings(buildQuery(alias));
    const aliasSample = spreadSample(aliasSearch.listings, CLASSIFY_SAMPLE);
    const aliasJudged = await keepRelevant(entityType, entityId, alias, aliasSample);
    cached += aliasJudged.cached;
    classified += aliasJudged.classified;
    const seen = new Set(relevant.map((r) => r.listing.legacyItemId));
    for (const r of aliasJudged.kept) {
      if (!seen.has(r.listing.legacyItemId)) relevant.push(r);
    }
    total += aliasSearch.total;
    examined += aliasSample.length;
  }

  // The same floor the sold estimator uses: a cap or a box listed under the
  // lens's name would otherwise sit at the bottom of a thin sample and drag
  // the range down with it.
  relevant = relevant.filter((r) => r.listing.priceUsd >= MIN_PLAUSIBLE_USD);

  const prices = relevant.map((r) => r.listing.priceUsd).sort((a, b) => a - b);
  const median = percentile(prices, 0.5);
  const observedOn = new Date().toISOString().slice(0, 10);

  // eBay's own total counts every keyword match, which for a short model name
  // is mostly other products. Scaling it by the share of the sample that
  // survived classification gives a figure that means what the column says.
  const relevantRate = examined > 0 ? relevant.length / examined : 0;

  const snapshot = {
    medianUsd: median == null ? null : Math.round(median),
    p25Usd: (v => (v == null ? null : Math.round(v)))(percentile(prices, 0.25)),
    p75Usd: (v => (v == null ? null : Math.round(v)))(percentile(prices, 0.75)),
    sampleCount: prices.length,
    totalAvailable: Math.round(total * relevantRate),
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

  // The disappearance signal is only trustworthy when the classified sample
  // covered everything eBay had: past that, a listing can be missing from our
  // slice while still being perfectly alive.
  await syncWatchList(entityType, entityId, relevant, total <= examined);
  await recomputePriceEstimates(entityType, entityId);
  return { sampled: prices.length, total, median, cached, classified };
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
  relevant: RelevantListing[],
  sawWholePool: boolean,
): Promise<void> {
  const now = new Date();
  const seenIds = new Set(relevant.map((r) => r.listing.legacyItemId));

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
      // poolComplete is refreshed too: an entity's pool grows and shrinks, and
      // whether the diff can see all of it is a property of today's search
      // rather than of the day the listing was first noticed.
      .set({ lastSeenActiveAt: now, disappearedAt: null, poolComplete: sawWholePool })
      .where(
        and(
          eq(ebayListingWatch.entityType, entityType),
          eq(ebayListingWatch.entityId, entityId),
          inArray(ebayListingWatch.legacyItemId, stillListed),
        ),
      );
  }

  // Gone from a sample that covered the whole pool, so it really has ended.
  // Where the pool was larger than what we classified, absence proves nothing
  // and those rows keep resolving on the timer instead.
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
  const fresh = relevant.filter((r) => !watchedIds.has(r.listing.legacyItemId));
  const toAdd = spreadSample(
    fresh.map((r) => r.listing),
    room,
  );
  if (toAdd.length === 0) return;
  const gradeById = new Map(
    fresh.map((r) => [r.listing.legacyItemId, r.grade] as const),
  );

  await db
    .insert(ebayListingWatch)
    .values(
      toAdd.map((l) => ({
        entityType,
        entityId,
        legacyItemId: l.legacyItemId,
        title: l.title.slice(0, 200),
        // The classifier's grade, not eBay's bare "Used". This is what lets a
        // sale recovered later carry a real condition instead of none.
        condition: gradeById.get(l.legacyItemId) ?? null,
        askingPriceUsd: Math.round(l.priceUsd),
        lastSeenActiveAt: now,
        poolComplete: sawWholePool,
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

  // Size this batch against what eBay says is actually left, not against what
  // the caller asked for. A budget agreed in advance cannot know what else
  // spent the allowance today.
  const quota = await getBrowseQuota();
  const spendable = quota
    ? Math.max(0, quota.remaining - QUOTA_RESERVED_FOR_SITE)
    : limit;
  if (spendable === 0) {
    return NextResponse.json({
      entityType,
      requested: 0,
      processed: 0,
      withListings: 0,
      failed: 0,
      rateLimited: false,
      quotaExhausted: true,
      quotaRemaining: quota?.remaining ?? null,
      remainingToday: await countDue(entityType),
    });
  }
  const batchLimit = Math.min(limit, spendable);

  // A single entity can be re-ingested on demand, which is the only way to
  // refresh one without waiting for it to come round in the rotation.
  const onlyId = Number(params.get("entityId")) || null;
  const batch = onlyId
    ? await db
        .select({
          id: entityType === "lens" ? lenses.id : cameras.id,
          name: entityType === "lens" ? lenses.name : cameras.name,
          alias: entityType === "camera" ? cameras.alias : sql<string | null>`NULL`,
        })
        .from(entityType === "lens" ? lenses : cameras)
        .where(eq(entityType === "lens" ? lenses.id : cameras.id, onlyId))
        .limit(1)
    : await getBatch(entityType, batchLimit);

  let processed = 0;
  let withListings = 0;
  // How much of the relevance judging was answered from the verdict cache
  // rather than bought from the model. This is the pipeline's largest running
  // cost, so the run says plainly how much of it was avoided.
  let listingsFromCache = 0;
  let listingsClassified = 0;
  let failed = 0;
  let rateLimited = false;

  for (const entity of batch) {
    try {
      const result = await ingestOne(
        entityType,
        entity.id,
        entity.name,
        entity.alias ?? null,
      );
      processed++;
      listingsFromCache += result.cached;
      listingsClassified += result.classified;
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

  // Drop snapshots nothing reads any more. Cheap enough to run every call:
  // with the index on observed_on this is a range scan that matches nothing
  // until the table is over a year old.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SNAPSHOT_RETENTION_DAYS);
  const pruned = await db
    .delete(ebayAskingSnapshots)
    .where(lt(ebayAskingSnapshots.observedOn, cutoff.toISOString().slice(0, 10)))
    .returning({ id: ebayAskingSnapshots.id });

  // A verdict is only worth keeping while the listing it describes might still
  // be live. Past that it is a judgement about something nobody can buy.
  const verdictCutoff = new Date();
  verdictCutoff.setDate(verdictCutoff.getDate() - VERDICT_RETENTION_DAYS);
  await db
    .delete(ebayListingVerdicts)
    .where(lt(ebayListingVerdicts.judgedAt, verdictCutoff));

  return NextResponse.json({
    entityType,
    requested: batch.length,
    processed,
    withListings,
    failed,
    rateLimited,
    quotaExhausted: false,
    quotaRemaining: quota?.remaining ?? null,
    listingsFromCache,
    listingsClassified,
    prunedSnapshots: pruned.length,
    remainingToday: await countDue(entityType),
  });
}
