import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { ebayListingWatch, priceHistory } from "@/db/schema";
import { sql, eq, and, isNull, isNotNull, asc, or, lt } from "drizzle-orm";
import { resolveListing, getBrowseQuota, EbayApiError } from "@/lib/ebay-browse";
import { recomputePriceEstimates } from "@/lib/price-pipeline";

/**
 * Turns watched listings into recorded sales.
 *
 * eBay keeps ended listings resolvable long after they close — sales from
 * July still answered in September — so this is a single check per listing
 * rather than a poll, and nothing is lost by checking late.
 *
 * Only unambiguous sales are written. A listing whose signals do not clearly
 * say "sold" or "did not sell" is retired as ambiguous rather than guessed
 * at: a fabricated sale would corrupt the very number this exists to protect.
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 400;

/** Listings rarely end the day they are found; checking sooner wastes calls. */
const MIN_AGE_DAYS_BEFORE_CHECK = 3;
/**
 * Timer sweep interval for listings with no disappearance signal, which is
 * only entities whose live pool exceeds the API's 200-result page. Kept long
 * because every such check usually just reports "still active".
 */
const RECHECK_AFTER_DAYS = 14;
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

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const staleCheck = new Date();
  staleCheck.setDate(staleCheck.getDate() - RECHECK_AFTER_DAYS);
  const minAge = new Date();
  minAge.setDate(minAge.getDate() - MIN_AGE_DAYS_BEFORE_CHECK);

  // Nothing here expires, so when the allowance runs low this pass simply
  // waits for tomorrow rather than competing with the site for the last of it.
  const quota = await getBrowseQuota();
  const spendable = quota
    ? Math.max(0, quota.remaining - QUOTA_RESERVED_FOR_SITE)
    : limit;
  if (spendable === 0) {
    return NextResponse.json({
      checked: 0,
      quotaExhausted: true,
      quotaRemaining: quota?.remaining ?? null,
    });
  }
  const batchLimit = Math.min(limit, spendable);

  const columns = {
    id: ebayListingWatch.id,
    entityType: ebayListingWatch.entityType,
    entityId: ebayListingWatch.entityId,
    legacyItemId: ebayListingWatch.legacyItemId,
    condition: ebayListingWatch.condition,
  };

  // Listings that a complete search stopped returning. These have ended, so
  // every call spent here is a call spent on a possible sale.
  const disappeared = await db
    .select(columns)
    .from(ebayListingWatch)
    .where(
      and(
        isNull(ebayListingWatch.resolution),
        isNotNull(ebayListingWatch.disappearedAt),
      ),
    )
    .orderBy(asc(ebayListingWatch.disappearedAt))
    .limit(batchLimit);

  // Entities with more live listings than the API's 200-result page never get
  // a trustworthy disappearance signal, because a listing can fall off the
  // page while still being active. Their rows still need a slow timer sweep,
  // but only with whatever budget the disappeared queue left over.
  const room = batchLimit - disappeared.length;
  const timed =
    room > 0
      ? await db
          .select(columns)
          .from(ebayListingWatch)
          .where(
            and(
              isNull(ebayListingWatch.resolution),
              isNull(ebayListingWatch.disappearedAt),
              lt(ebayListingWatch.firstSeenAt, minAge),
              or(
                isNull(ebayListingWatch.lastCheckedAt),
                lt(ebayListingWatch.lastCheckedAt, staleCheck),
              ),
            ),
          )
          .orderBy(
            asc(ebayListingWatch.lastCheckedAt),
            asc(ebayListingWatch.firstSeenAt),
          )
          .limit(room)
      : [];

  const pending = [...disappeared, ...timed];

  const counts = { sold: 0, expired: 0, active: 0, ambiguous: 0, gone: 0, failed: 0 };
  const touched = new Set<string>();
  let rateLimited = false;

  for (const row of pending) {
    let outcome;
    try {
      outcome = await resolveListing(row.legacyItemId);
    } catch (error) {
      if (error instanceof EbayApiError && (error.status === 429 || error.status === 403)) {
        rateLimited = true;
        console.error(`[ebay-resolve] eBay refused (${error.status}); stopping run`);
        break;
      }
      counts.failed++;
      console.error(`[ebay-resolve] ${row.legacyItemId}:`, error);
      continue;
    }

    const now = new Date();

    if (outcome.state === "active") {
      counts.active++;
      await db
        .update(ebayListingWatch)
        .set({ lastCheckedAt: now })
        .where(eq(ebayListingWatch.id, row.id));
      continue;
    }

    if (outcome.state === "sold") {
      counts.sold++;
      await db
        .update(ebayListingWatch)
        .set({
          lastCheckedAt: now,
          resolution: "sold",
          soldPriceUsd: Math.round(outcome.priceUsd),
          soldOn: outcome.soldOn,
        })
        .where(eq(ebayListingWatch.id, row.id));

      // The partial unique index on (entity, source_url) makes this idempotent.
      await db
        .insert(priceHistory)
        .values({
          entityType: row.entityType,
          entityId: row.entityId,
          saleDate: outcome.soldOn,
          // Already a grade: the classifier assigned it from the listing's own
          // wording when the listing was first seen, while it was still up.
          condition: row.condition,
          priceUsd: Math.round(outcome.priceUsd),
          source: "eBay",
          sourceUrl: `https://www.ebay.com/itm/${row.legacyItemId}`,
          extractedAt: now,
        })
        .onConflictDoNothing({
          target: [
            priceHistory.entityType,
            priceHistory.entityId,
            priceHistory.sourceUrl,
          ],
          where: sql`source_url IS NOT NULL`,
        });

      touched.add(`${row.entityType}:${row.entityId}`);
      continue;
    }

    // expired, ambiguous or gone: retire the row, record nothing.
    counts[outcome.state]++;
    await db
      .update(ebayListingWatch)
      .set({ lastCheckedAt: now, resolution: outcome.state })
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
      and(
        isNotNull(ebayListingWatch.resolution),
        lt(ebayListingWatch.lastCheckedAt, pruneBefore),
      ),
    );

  const [{ stillPending }] = await db
    .select({ stillPending: sql<number>`count(*)` })
    .from(ebayListingWatch)
    .where(isNull(ebayListingWatch.resolution));

  const [{ queued }] = await db
    .select({ queued: sql<number>`count(*)` })
    .from(ebayListingWatch)
    .where(
      and(
        isNull(ebayListingWatch.resolution),
        isNotNull(ebayListingWatch.disappearedAt),
      ),
    );

  return NextResponse.json({
    checked: pending.length,
    quotaExhausted: false,
    quotaRemaining: quota?.remaining ?? null,
    fromDisappeared: disappeared.length,
    fromTimer: timed.length,
    ...counts,
    entitiesRecomputed: touched.size,
    rateLimited,
    queuedDisappeared: Number(queued),
    stillPending: Number(stillPending),
  });
}
