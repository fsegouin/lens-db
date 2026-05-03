import { unstable_cache } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { priceEstimates, priceHistory } from "@/db/schema";

export const getEntityPriceEstimate = unstable_cache(
  async (entityType: string, entityId: number) => {
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
  ["entity-price-estimate"],
  { revalidate: 86400, tags: ["prices"] },
);

export const getEntityPriceHistory = unstable_cache(
  async (entityType: string, entityId: number) => {
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
  ["entity-price-history"],
  { revalidate: 86400, tags: ["prices"] },
);
