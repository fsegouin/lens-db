import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { ebayListingWatch, priceHistory } from "@/db/schema";
import { sql, eq, and, isNull, asc, or, lt } from "drizzle-orm";
import { resolveListing, EbayApiError } from "@/lib/ebay-browse";
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
/** How long to leave a still-active listing before looking again. */
const RECHECK_AFTER_DAYS = 7;

export const maxDuration = 300;

/**
 * eBay's coarse condition mapped to the site's grades. "Used" is deliberately
 * absent: it covers everything from beaten to mint, and the old pipeline only
 * had a grade because an LLM read the seller's own wording off the sold page.
 * Browse gives no such wording, so those sales carry an unknown grade and
 * count toward the median without inventing a condition tier.
 */
const CONDITION_GRADE: Record<string, string> = {
  "Brand New": "A",
  New: "A",
  "Open Box": "A",
  "New other (see details)": "A",
  "Very Good - Refurbished": "A",
  "Excellent - Refurbished": "A",
  "Certified - Refurbished": "A",
  "For parts or not working": "D",
};

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

  const pending = await db
    .select({
      id: ebayListingWatch.id,
      entityType: ebayListingWatch.entityType,
      entityId: ebayListingWatch.entityId,
      legacyItemId: ebayListingWatch.legacyItemId,
      condition: ebayListingWatch.condition,
    })
    .from(ebayListingWatch)
    .where(
      and(
        isNull(ebayListingWatch.resolution),
        lt(ebayListingWatch.firstSeenAt, minAge),
        or(
          isNull(ebayListingWatch.lastCheckedAt),
          lt(ebayListingWatch.lastCheckedAt, staleCheck),
        ),
      ),
    )
    .orderBy(asc(ebayListingWatch.lastCheckedAt), asc(ebayListingWatch.firstSeenAt))
    .limit(limit);

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
          condition: row.condition ? CONDITION_GRADE[row.condition] ?? null : null,
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

  const [{ stillPending }] = await db
    .select({ stillPending: sql<number>`count(*)` })
    .from(ebayListingWatch)
    .where(isNull(ebayListingWatch.resolution));

  return NextResponse.json({
    checked: pending.length,
    ...counts,
    entitiesRecomputed: touched.size,
    rateLimited,
    stillPending: Number(stillPending),
  });
}
