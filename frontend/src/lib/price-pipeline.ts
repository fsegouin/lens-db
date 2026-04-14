import { db } from "@/db";
import { priceHistory, priceEstimates } from "@/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import type { ClassifiedListing, RawListing } from "@/lib/price-classify";

const GRADE_MAP: Record<string, string> = {
  excellent: "A",
  good: "B",
  fair: "C",
};

export async function storeClassifiedSales(
  entityType: string,
  entityId: number,
  classified: ClassifiedListing[],
  raw: RawListing[],
  extractedAt: string,
): Promise<number> {
  let stored = 0;

  for (let i = 0; i < classified.length; i++) {
    const cl = classified[i];
    const rawListing = raw[i];
    if (!rawListing) continue;

    if (!cl.isRelevant || cl.conditionGrade === "skip") continue;

    const condition = GRADE_MAP[cl.conditionGrade] ?? cl.conditionGrade;
    const sourceUrl = rawListing.url ?? null;

    // Check for duplicate
    if (sourceUrl) {
      const existing = await db
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.entityType, entityType),
            eq(priceHistory.entityId, entityId),
            eq(priceHistory.sourceUrl, sourceUrl),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    } else {
      const existing = await db
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.entityType, entityType),
            eq(priceHistory.entityId, entityId),
            eq(priceHistory.saleDate, rawListing.date),
            eq(priceHistory.priceUsd, Math.round(cl.effectivePrice)),
            eq(priceHistory.source, "eBay"),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    }

    await db.insert(priceHistory).values({
      entityType,
      entityId,
      saleDate: rawListing.date,
      condition,
      priceUsd: Math.round(cl.effectivePrice),
      source: "eBay",
      sourceUrl,
      extractedAt: new Date(extractedAt),
    });
    stored++;
  }

  return stored;
}

function computeRange(prices: number[]): [number | null, number | null] {
  if (prices.length === 0) return [null, null];
  prices.sort((a, b) => a - b);
  const n = prices.length;
  if (n === 1) return [prices[0], prices[0]];
  const lowIdx = Math.max(0, Math.floor(n * 0.25));
  const highIdx = Math.min(n - 1, Math.floor(n * 0.75));
  return [prices[lowIdx], prices[highIdx]];
}

export async function recomputePriceEstimates(
  entityType: string,
  entityId: number,
): Promise<void> {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const rows = await db
    .select({
      condition: priceHistory.condition,
      priceUsd: priceHistory.priceUsd,
      saleDate: priceHistory.saleDate,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, entityType),
        eq(priceHistory.entityId, entityId),
        gt(priceHistory.priceUsd, 0),
        sql`${priceHistory.saleDate} >= ${twoYearsAgo.toISOString().slice(0, 10)}`,
      ),
    );

  // If no price history, just upsert a tracking row so we know this camera was scraped
  if (rows.length === 0) {
    const now = new Date();
    await db
      .insert(priceEstimates)
      .values({
        entityType,
        entityId,
        sourceName: "eBay",
        rarity: "Extremely rare",
        rarityVotes: 0,
        extractedAt: now,
      })
      .onConflictDoUpdate({
        target: [priceEstimates.entityType, priceEstimates.entityId],
        set: { extractedAt: now },
      });
    return;
  }

  // Bucket by condition
  const buckets: Record<string, number[]> = { excellent: [], good: [], fair: [] };

  for (const row of rows) {
    const price = row.priceUsd!;
    const cond = row.condition ?? "";
    if (["A", "A+", "A-B"].includes(cond)) {
      buckets.excellent.push(price);
    } else if (["B", "B+", "B-A"].includes(cond)) {
      buckets.good.push(price);
    } else {
      buckets.fair.push(price);
    }
  }

  let [avgLow, avgHigh] = computeRange(buckets.fair);
  let [vgLow, vgHigh] = computeRange(buckets.good);
  let [mintLow, mintHigh] = computeRange(buckets.excellent);

  // Fallback: estimate empty buckets from overall distribution
  const allPrices = rows.map((r) => r.priceUsd!).sort((a, b) => a - b);
  if (buckets.fair.length === 0 && allPrices.length > 0) {
    avgLow = allPrices[Math.floor(allPrices.length * 0.15)];
    avgHigh = allPrices[Math.floor(allPrices.length * 0.40)];
  }
  if (buckets.good.length === 0 && allPrices.length > 0) {
    vgLow = allPrices[Math.floor(allPrices.length * 0.40)];
    vgHigh = allPrices[Math.floor(allPrices.length * 0.65)];
  }
  if (buckets.excellent.length === 0 && allPrices.length > 0) {
    mintLow = allPrices[Math.floor(allPrices.length * 0.75)];
    mintHigh = allPrices[Math.min(allPrices.length - 1, Math.floor(allPrices.length * 0.95))];
  }

  // Median: prefer 90-day window if enough data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentRows = await db
    .select({ priceUsd: priceHistory.priceUsd })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, entityType),
        eq(priceHistory.entityId, entityId),
        gt(priceHistory.priceUsd, 0),
        sql`${priceHistory.saleDate} >= ${ninetyDaysAgo.toISOString().slice(0, 10)}`,
      ),
    );

  const recentPrices = recentRows.map((r) => r.priceUsd!).sort((a, b) => a - b);
  const medianSource = recentPrices.length >= 5 ? recentPrices : allPrices;
  const medianPrice = medianSource.length > 0
    ? medianSource[Math.floor(medianSource.length / 2)]
    : null;

  // Rarity from 90-day volume
  const recentCount = recentRows.length;
  let rarity: string;
  if (recentCount >= 20) rarity = "Very common";
  else if (recentCount >= 10) rarity = "Common";
  else if (recentCount >= 4) rarity = "Somewhat rare";
  else if (recentCount >= 1) rarity = "Very scarce";
  else rarity = "Extremely rare";

  const now = new Date();

  await db
    .insert(priceEstimates)
    .values({
      entityType,
      entityId,
      sourceName: "eBay",
      priceAverageLow: avgLow,
      priceAverageHigh: avgHigh,
      priceVeryGoodLow: vgLow,
      priceVeryGoodHigh: vgHigh,
      priceMintLow: mintLow,
      priceMintHigh: mintHigh,
      medianPrice,
      rarity,
      rarityVotes: recentCount,
      extractedAt: now,
    })
    .onConflictDoUpdate({
      target: [priceEstimates.entityType, priceEstimates.entityId],
      set: {
        sourceName: "eBay",
        priceAverageLow: avgLow,
        priceAverageHigh: avgHigh,
        priceVeryGoodLow: vgLow,
        priceVeryGoodHigh: vgHigh,
        priceMintLow: mintLow,
        priceMintHigh: mintHigh,
        medianPrice,
        rarity,
        rarityVotes: recentCount,
        extractedAt: now,
      },
    });
}
