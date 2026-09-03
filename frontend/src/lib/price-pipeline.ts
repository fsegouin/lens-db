import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { priceTag } from "@/lib/prices";
import { priceHistory, priceEstimates } from "@/db/schema";
import { eq, and, sql, gte, inArray, isNull } from "drizzle-orm";
import type { RawListing } from "@/lib/price-classify";

const GRADE_MAP: Record<string, string> = {
  excellent: "A",
  good: "B",
  fair: "C",
};

type NewRow = typeof priceHistory.$inferInsert;

// Minimal structural view of a classified listing — only the fields this
// function reads. Both camera (ClassifiedListing) and lens
// (ClassifiedLensListing) classification results satisfy it.
export interface ClassifiedSaleInput {
  isRelevant: boolean;
  conditionGrade: string;
  effectivePrice: number;
}

export async function storeClassifiedSales(
  entityType: string,
  entityId: number,
  classified: ClassifiedSaleInput[],
  raw: RawListing[],
  extractedAt: string,
): Promise<number> {
  const extractedAtDate = new Date(extractedAt);
  const withUrl: NewRow[] = [];
  const withoutUrl: NewRow[] = [];

  for (let i = 0; i < classified.length; i++) {
    const cl = classified[i];
    const rawListing = raw[i];
    if (!rawListing) continue;
    if (!cl.isRelevant || cl.conditionGrade === "skip") continue;

    const row: NewRow = {
      entityType,
      entityId,
      saleDate: rawListing.date,
      condition: GRADE_MAP[cl.conditionGrade] ?? cl.conditionGrade,
      priceUsd: Math.round(cl.effectivePrice),
      source: "eBay",
      sourceUrl: rawListing.url ?? null,
      extractedAt: extractedAtDate,
    };
    if (row.sourceUrl) withUrl.push(row);
    else withoutUrl.push(row);
  }

  let stored = 0;

  // Bulk path for listings with a sourceUrl: rely on the partial unique
  // index (uq_price_history_entity_source_url) to skip duplicates.
  if (withUrl.length > 0) {
    const inserted = await db
      .insert(priceHistory)
      .values(withUrl)
      .onConflictDoNothing({
        target: [
          priceHistory.entityType,
          priceHistory.entityId,
          priceHistory.sourceUrl,
        ],
        where: sql`source_url IS NOT NULL`,
      })
      .returning({ id: priceHistory.id });
    stored += inserted.length;
  }

  // Fallback for listings without a sourceUrl (rare for eBay, but
  // possible from other sources). Pre-fetch existing tuples for this
  // entity in one query, then bulk insert the new ones.
  if (withoutUrl.length > 0) {
    const existing = await db
      .select({
        saleDate: priceHistory.saleDate,
        priceUsd: priceHistory.priceUsd,
      })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.entityType, entityType),
          eq(priceHistory.entityId, entityId),
          eq(priceHistory.source, "eBay"),
          isNull(priceHistory.sourceUrl),
          inArray(
            priceHistory.saleDate,
            withoutUrl.map((r) => r.saleDate as string),
          ),
        ),
      );
    const seen = new Set(
      existing.map((e) => `${e.saleDate}|${e.priceUsd}`),
    );
    const fresh = withoutUrl.filter(
      (r) => !seen.has(`${r.saleDate}|${r.priceUsd}`),
    );
    if (fresh.length > 0) {
      await db.insert(priceHistory).values(fresh);
      stored += fresh.length;
    }
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

/**
 * Sales below this are not used-market prices. They are parts listings, empty
 * boxes, caps sold under the lens's name, or a mis-parsed amount, and because
 * the headline range spans the lowest tier bound to the highest, a single one
 * of them sets what the page says a lens is worth: a Mamiya-Sekor C 127mm
 * read "$2" against a $190 median. 97 of 92,870 recorded lens sales sit here.
 */
const MIN_PLAUSIBLE_SALE_USD = 5;

/**
 * Recency windows tried in order, narrowest first, and the sample count a
 * window needs before its median is trusted. 90 days is still the preferred
 * answer whenever the market gives us one.
 */
const MEDIAN_WINDOW_DAYS = [90, 365];
const MIN_SAMPLES_PER_WINDOW = 5;

function medianOf(prices: number[]): number | null {
  if (prices.length === 0) return null;
  return prices[Math.floor(prices.length / 2)];
}

/**
 * Median sale price from the narrowest window holding enough sales, falling
 * back to the full retained history. `rows` and `allPrices` are already
 * filtered to plausible sales inside the retention window; `allPrices` must
 * be sorted ascending.
 */
function medianForWindows(
  rows: { priceUsd: number | null; saleDate: string | null }[],
  allPrices: number[],
): number | null {
  for (const days of MEDIAN_WINDOW_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const iso = cutoff.toISOString().slice(0, 10);
    const inWindow = rows
      .filter((r) => r.saleDate != null && r.saleDate >= iso)
      .map((r) => r.priceUsd!)
      .sort((a, b) => a - b);
    if (inWindow.length >= MIN_SAMPLES_PER_WINDOW) return medianOf(inWindow);
  }
  return medianOf(allPrices);
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
        gte(priceHistory.priceUsd, MIN_PLAUSIBLE_SALE_USD),
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
        extractedAt: now,
      })
      .onConflictDoUpdate({
        target: [priceEstimates.entityType, priceEstimates.entityId],
        set: { extractedAt: now },
      });
    revalidateTag(priceTag(entityType, entityId), "max");
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

  // Median from the narrowest recent window that still holds enough sales.
  // A fixed 90-day window is only honest while ingest keeps up: the moment it
  // pauses the window empties, and every lens reads as though the market went
  // silent rather than as though we stopped looking. Widening on demand keeps
  // the estimate meaningful through a gap and still prefers fresh data when
  // there is fresh data to prefer.
  const medianPrice = medianForWindows(rows, allPrices);

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
        extractedAt: now,
      },
    });

  revalidateTag(priceTag(entityType, entityId), "max");
}
