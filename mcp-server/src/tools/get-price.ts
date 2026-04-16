import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "../db";

const { cameras, lenses, priceEstimates, priceHistory } = schema;

export const getPriceSchema = z.object({
  entityType: z.enum(["camera", "lens"]).describe("Type of entity"),
  slug: z.string().describe("Entity slug"),
});

export type GetPriceParams = z.infer<typeof getPriceSchema>;

export async function getPrice(params: GetPriceParams) {
  const db = getDb();

  // Resolve slug to entity ID
  const table = params.entityType === "camera" ? cameras : lenses;
  const [entity] = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.slug, params.slug))
    .limit(1);

  if (!entity) {
    return { error: `${params.entityType} not found with slug: ${params.slug}` };
  }

  // Get price estimate
  const [estimate] = await db
    .select()
    .from(priceEstimates)
    .where(
      and(
        eq(priceEstimates.entityType, params.entityType),
        eq(priceEstimates.entityId, entity.id)
      )
    )
    .limit(1);

  // Get recent sale history (last 10)
  const history = await db
    .select({
      saleDate: priceHistory.saleDate,
      condition: priceHistory.condition,
      priceUsd: priceHistory.priceUsd,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, params.entityType),
        eq(priceHistory.entityId, entity.id)
      )
    )
    .orderBy(desc(priceHistory.saleDate))
    .limit(10);

  return {
    name: entity.name,
    estimate: estimate
      ? {
          medianPrice: estimate.medianPrice,
          priceAverageLow: estimate.priceAverageLow,
          priceAverageHigh: estimate.priceAverageHigh,
          priceVeryGoodLow: estimate.priceVeryGoodLow,
          priceVeryGoodHigh: estimate.priceVeryGoodHigh,
          priceMintLow: estimate.priceMintLow,
          priceMintHigh: estimate.priceMintHigh,
          currency: estimate.currency,
          rarity: estimate.rarity,
        }
      : null,
    recentSales: history,
  };
}
