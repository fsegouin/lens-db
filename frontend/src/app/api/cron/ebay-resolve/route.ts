import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { ebayListingWatch, priceHistory } from "@/db/schema";
import { sql, eq, and, isNull, isNotNull, asc, or, lt, gte, inArray } from "drizzle-orm";
import {
  resolveListing,
  getBrowseQuota,
  EbayApiError,
  type Resolution,
} from "@/lib/ebay-browse";
import { decide, needsBrowse, type PageVerdict } from "@/lib/ebay-resolution";
import { recomputePriceEstimates } from "@/lib/price-pipeline";

/**
 * Turns watched listings into recorded sales, in two halves.
 *
 * GET hands the runner the listings due a check. The runner reads each
 * listing's own page (/itm/<id>) and POSTs back what the page said, and POST
 * applies it (scraper/ebay-resolve-action.mjs drives both).
 *
 * The page comes first because the Browse API cannot tell a sale from a
 * listing its seller pulled: both come back with a sold quantity, nothing
 * remaining and a price. In September 2026, 41 of 142 sales recorded from
 * Browse alone were seller-ended. The page says which in so many words, and
 * the rule for combining the two lives in lib/ebay-resolution.ts.
 *
 * eBay keeps ended listings resolvable long after they close (sales from
 * July still answered in September), so this is a single check per listing
 * rather than a poll, and nothing is lost by checking late.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Listings rarely end the day they are found; checking sooner wastes calls. */
const MIN_AGE_DAYS_BEFORE_CHECK = 3;
/**
 * Timer sweep interval for listings with no disappearance signal, which is
 * only entities whose live pool exceeds the API's 200-result page. Kept long
 * because every such check usually just reports "still active".
 */
const RECHECK_AFTER_DAYS = 30;
/**
 * Timer checks allowed in any 24 hours. The timer queue held 29,000 rows in
 * September 2026, which at one check per interval is thousands of calls a day
 * spent mostly on listings that are still up, while a disappeared listing
 * turns into a sale about one time in six. The cap keeps the timer from ever
 * owning the day's budget again.
 */
const TIMER_DAILY_CAP = 300;
/**
 * How long a resolved watch row is kept before deletion. The sale it produced
 * lives permanently in price_history; the row itself is only scaffolding.
 */
const RESOLVED_RETENTION_DAYS = 30;

/**
 * Browse calls held back for the listings shown on entity pages. Resolving is
 * never urgent, since an ended listing stays resolvable for months, so this
 * pass yields the allowance to the site without losing anything.
 */
const QUOTA_RESERVED_FOR_SITE = 400;

export const maxDuration = 300;

const PAGE_VERDICTS = new Set(["sold", "seller_ended", "blocked"]);

function dayAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/** The listings due a check, disappeared ones first. Changes nothing. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // Most verdicts need a Browse call to settle, so once the allowance is at
  // its reserve there is no point reading pages today. Reading the figure is
  // free: the analytics endpoint has its own allowance.
  const quota = await getBrowseQuota();
  if (quota && quota.remaining <= QUOTA_RESERVED_FOR_SITE) {
    return NextResponse.json({
      listings: [],
      quotaExhausted: true,
      quotaRemaining: quota.remaining,
    });
  }

  const staleCheck = new Date();
  staleCheck.setDate(staleCheck.getDate() - RECHECK_AFTER_DAYS);
  const minAge = new Date();
  minAge.setDate(minAge.getDate() - MIN_AGE_DAYS_BEFORE_CHECK);
  const since = dayAgo();

  const columns = { id: ebayListingWatch.id, legacyItemId: ebayListingWatch.legacyItemId };

  // Listings that a complete search stopped returning. These have ended, so
  // every page read here is a page read on a possible sale.
  //
  // Anything checked in the last day is left out. A listing that could not
  // be settled (page blocked, Browse down or at its reserve) keeps its flag,
  // and this queue is read before anything else, so without the guard the
  // same few rows would head every batch. That is how one run spent 2,000
  // calls on about 170 listings.
  const disappeared = await db
    .select(columns)
    .from(ebayListingWatch)
    .where(
      and(
        isNull(ebayListingWatch.resolution),
        isNotNull(ebayListingWatch.disappearedAt),
        or(isNull(ebayListingWatch.lastCheckedAt), lt(ebayListingWatch.lastCheckedAt, since)),
      ),
    )
    .orderBy(asc(ebayListingWatch.disappearedAt))
    .limit(limit);

  // Entities with more live listings than one page of search results never
  // get a trustworthy disappearance signal, because a listing can fall off
  // the page while still being live. Only those rows need a timer sweep, and
  // it gets whatever room the disappeared queue left, up to its cap.
  //
  // The pool_complete = false test is what keeps this cheap. Without it the
  // timer treats every pending row alike and spends the whole daily budget
  // re-checking listings that are still up, for the entities whose next
  // weekly sweep would have caught them for nothing. Rows predating the
  // column are null, which fails this test and is the right default: the next
  // sweep of that entity fills it in.
  //
  // A checked row with no disappearance is a timer check: a disappeared row
  // that proved live has its flag cleared, so it counts here too, which errs
  // on the side of spending less.
  const [{ timerSpent }] = await db
    .select({ timerSpent: sql<number>`count(*)` })
    .from(ebayListingWatch)
    .where(
      and(isNull(ebayListingWatch.disappearedAt), gte(ebayListingWatch.lastCheckedAt, since)),
    );
  const room = Math.min(limit - disappeared.length, TIMER_DAILY_CAP - Number(timerSpent));
  const timed =
    room > 0
      ? await db
          .select(columns)
          .from(ebayListingWatch)
          .where(
            and(
              isNull(ebayListingWatch.resolution),
              isNull(ebayListingWatch.disappearedAt),
              eq(ebayListingWatch.poolComplete, false),
              lt(ebayListingWatch.firstSeenAt, minAge),
              or(
                isNull(ebayListingWatch.lastCheckedAt),
                lt(ebayListingWatch.lastCheckedAt, staleCheck),
              ),
            ),
          )
          .orderBy(asc(ebayListingWatch.lastCheckedAt), asc(ebayListingWatch.firstSeenAt))
          .limit(room)
      : [];

  return NextResponse.json({
    listings: [...disappeared, ...timed],
    fromDisappeared: disappeared.length,
    fromTimer: timed.length,
    quotaExhausted: false,
    quotaRemaining: quota?.remaining ?? null,
  });
}

/**
 * Apply what the runner read off each listing's page.
 *
 * Body: { results: [{ id, page }] }, id being the watch row's and page one of
 * "sold", "seller_ended", "blocked" or null. Every row posted is either
 * resolved or stamped as checked, so none of them comes back in the queue the
 * same day.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const posted: unknown = body?.results;
  if (!Array.isArray(posted) || posted.length > MAX_LIMIT) {
    return NextResponse.json({ error: `results must be an array of at most ${MAX_LIMIT}` }, { status: 400 });
  }
  const verdicts = new Map<number, PageVerdict>();
  for (const r of posted) {
    const page = r?.page ?? null;
    if (!Number.isInteger(r?.id) || (page !== null && !PAGE_VERDICTS.has(page))) {
      return NextResponse.json({ error: "each result needs an integer id and a known page" }, { status: 400 });
    }
    verdicts.set(r.id, page);
  }

  const rows =
    verdicts.size > 0
      ? await db
          .select({
            id: ebayListingWatch.id,
            entityType: ebayListingWatch.entityType,
            entityId: ebayListingWatch.entityId,
            legacyItemId: ebayListingWatch.legacyItemId,
            condition: ebayListingWatch.condition,
          })
          .from(ebayListingWatch)
          .where(
            and(inArray(ebayListingWatch.id, [...verdicts.keys()]), isNull(ebayListingWatch.resolution)),
          )
      : [];

  // Asked once for the batch. A null figure means the reporting endpoint
  // hiccupped, and the batch size is then the backstop.
  const needBrowse = rows.filter((row) => needsBrowse(verdicts.get(row.id) ?? null)).length;
  const quota = needBrowse > 0 ? await getBrowseQuota() : null;
  let browseLeft = quota ? Math.max(0, quota.remaining - QUOTA_RESERVED_FOR_SITE) : needBrowse;

  const counts = {
    sold: 0, sellerEnded: 0, expired: 0, ambiguous: 0, gone: 0,
    active: 0, blocked: 0, deferred: 0, failed: 0, browseCalls: 0,
  };
  const touched = new Set<string>();
  let rateLimited = false;

  for (const row of rows) {
    const page = verdicts.get(row.id) ?? null;
    let browse: Resolution | null = null;
    if (needsBrowse(page)) {
      if (browseLeft > 0 && !rateLimited) {
        browseLeft--;
        counts.browseCalls++;
        try {
          browse = await resolveListing(row.legacyItemId);
        } catch (error) {
          if (error instanceof EbayApiError && (error.status === 429 || error.status === 403)) {
            rateLimited = true;
            counts.deferred++;
            console.error(`[ebay-resolve] eBay refused (${error.status}); deferring the rest`);
          } else {
            counts.failed++;
            console.error(`[ebay-resolve] ${row.legacyItemId}:`, error);
          }
        }
      } else {
        counts.deferred++;
      }
    }

    const decision = decide(page, browse);
    const now = new Date();

    if (decision.action === "skip_for_a_day") {
      if (page === "blocked") counts.blocked++;
      await db
        .update(ebayListingWatch)
        .set({ lastCheckedAt: now })
        .where(eq(ebayListingWatch.id, row.id));
      continue;
    }

    if (decision.action === "still_live") {
      counts.active++;
      await db
        .update(ebayListingWatch)
        // A disappeared listing that is still up only fell out of one search.
        // Clearing the flag takes it out of the disappeared queue; the next
        // sweep flags it again if it really has gone.
        .set({ lastCheckedAt: now, disappearedAt: null })
        .where(eq(ebayListingWatch.id, row.id));
      continue;
    }

    if (decision.action === "record_sale") {
      counts.sold++;
      await db
        .update(ebayListingWatch)
        .set({
          lastCheckedAt: now,
          resolution: "sold",
          soldPriceUsd: Math.round(decision.priceUsd),
          soldOn: decision.soldOn,
        })
        .where(eq(ebayListingWatch.id, row.id));

      // The partial unique index on (entity, source_url) makes this idempotent.
      await db
        .insert(priceHistory)
        .values({
          entityType: row.entityType,
          entityId: row.entityId,
          saleDate: decision.soldOn,
          // Already a grade: the classifier assigned it from the listing's own
          // wording when the listing was first seen, while it was still up.
          condition: row.condition,
          priceUsd: Math.round(decision.priceUsd),
          source: "eBay",
          sourceUrl: `https://www.ebay.com/itm/${row.legacyItemId}`,
          extractedAt: now,
        })
        .onConflictDoNothing({
          target: [priceHistory.entityType, priceHistory.entityId, priceHistory.sourceUrl],
          where: sql`source_url IS NOT NULL`,
        });

      touched.add(`${row.entityType}:${row.entityId}`);
      continue;
    }

    // Retired: seller-ended, did not sell, unresolvable or ambiguous. The
    // row is kept for its grace period and nothing is recorded.
    if (decision.resolution === "seller_ended") counts.sellerEnded++;
    else counts[decision.resolution]++;
    await db
      .update(ebayListingWatch)
      .set({ lastCheckedAt: now, resolution: decision.resolution })
      .where(eq(ebayListingWatch.id, row.id));
  }

  // Recompute once per entity rather than once per sale.
  for (const key of touched) {
    const [entityType, entityId] = key.split(":");
    try {
      await recomputePriceEstimates(entityType, Number(entityId));
    } catch (error) {
      console.error(`[ebay-resolve] recompute ${key}:`, error);
    }
  }

  // Resolved rows are scaffolding. The sale itself is already recorded in
  // price_history, which is the durable artefact, so keeping the watch row
  // beyond a short grace period only spends storage. This is what stops the
  // table growing without bound on a 500 MB database.
  const pruneBefore = new Date();
  pruneBefore.setDate(pruneBefore.getDate() - RESOLVED_RETENTION_DAYS);
  await db
    .delete(ebayListingWatch)
    .where(
      and(isNotNull(ebayListingWatch.resolution), lt(ebayListingWatch.lastCheckedAt, pruneBefore)),
    );

  const [{ queued }] = await db
    .select({ queued: sql<number>`count(*)` })
    .from(ebayListingWatch)
    .where(and(isNull(ebayListingWatch.resolution), isNotNull(ebayListingWatch.disappearedAt)));

  return NextResponse.json({
    applied: rows.length,
    ...counts,
    entitiesRecomputed: touched.size,
    rateLimited,
    quotaExhausted: counts.deferred > 0 && !rateLimited,
    quotaRemaining: quota ? quota.remaining - counts.browseCalls : null,
    queuedDisappeared: Number(queued),
  });
}
