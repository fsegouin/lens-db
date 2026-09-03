import { unstable_cache } from "next/cache";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { priceEstimates, priceHistory, ebayAskingSnapshots } from "@/db/schema";

// Tag shared by both caches for one entity, so the price pipeline can
// invalidate just the entities it re-scraped instead of the whole catalog.
export function priceTag(entityType: string, entityId: number): string {
  return `prices-${entityType}-${entityId}`;
}

export function getEntityPriceEstimate(entityType: string, entityId: number) {
  return unstable_cache(
    async () => {
      const [estimate] = await db
        .select()
        .from(priceEstimates)
        .where(
          and(
            eq(priceEstimates.entityType, entityType),
            eq(priceEstimates.entityId, entityId),
          ),
        )
        .limit(1);
      return estimate ?? null;
    },
    ["entity-price-estimate", entityType, String(entityId)],
    { revalidate: 2592000, tags: ["prices", priceTag(entityType, entityId)] },
  )();
}

export function getEntityPriceHistory(entityType: string, entityId: number) {
  return unstable_cache(
    async () => {
      return db
        .select({
          saleDate: priceHistory.saleDate,
          condition: priceHistory.condition,
          priceUsd: priceHistory.priceUsd,
          source: priceHistory.source,
          sourceUrl: priceHistory.sourceUrl,
        })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.entityType, entityType),
            eq(priceHistory.entityId, entityId),
          ),
        )
        .orderBy(desc(priceHistory.saleDate));
    },
    ["entity-price-history", entityType, String(entityId)],
    { revalidate: 2592000, tags: ["prices", priceTag(entityType, entityId)] },
  )();
}

/**
 * Daily asking-price aggregates for the chart, most recent year.
 *
 * Deliberately a separate series from price history: asking prices say what
 * sellers want and sales say what buyers paid, and the gap between the two is
 * the interesting part. Merging them into one line would hide exactly the
 * thing worth showing.
 */
export function getEntityAskingHistory(entityType: string, entityId: number) {
  return unstable_cache(
    async () => {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      return db
        .select({
          observedOn: ebayAskingSnapshots.observedOn,
          medianUsd: ebayAskingSnapshots.medianUsd,
          p25Usd: ebayAskingSnapshots.p25Usd,
          p75Usd: ebayAskingSnapshots.p75Usd,
          sampleCount: ebayAskingSnapshots.sampleCount,
        })
        .from(ebayAskingSnapshots)
        .where(
          and(
            eq(ebayAskingSnapshots.entityType, entityType),
            eq(ebayAskingSnapshots.entityId, entityId),
            gte(
              ebayAskingSnapshots.observedOn,
              cutoff.toISOString().slice(0, 10),
            ),
            sql`${ebayAskingSnapshots.medianUsd} IS NOT NULL`,
          ),
        )
        .orderBy(ebayAskingSnapshots.observedOn);
    },
    ["entity-asking-history", entityType, String(entityId)],
    { revalidate: 2592000, tags: ["prices", priceTag(entityType, entityId)] },
  )();
}
