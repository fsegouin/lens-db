import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { priceTag } from "@/lib/prices";
import { priceHistory, priceEstimates, ebayAskingSnapshots } from "@/db/schema";
import { eq, and, sql, gte, inArray, isNull, desc } from "drizzle-orm";
import { ASKING_TO_SOLD_RATIO } from "@/lib/ebay-browse";
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

/**
 * Confirmed sales needed before sold data outranks the asking sample. Below
 * this a lens's "sold price" would rest on one or two listings, which is a
 * worse answer than the median of two hundred live ones.
 */
const MIN_SOLD_SALES_FOR_ESTIMATE = 3;

/**
 * Live listings needed before an asking snapshot is published at all.
 *
 * A median of three is thin but it is still the middle of three real prices.
 * What could not be defended was the *range*: on three listings p25 and p75
 * are simply the cheapest and the dearest, which is how a Canon Serenar 50mm
 * came to read "$78 to $4,112" and a Canon 85mm f/1.5 "$1,154 to $11,638".
 */
const MIN_ASKING_SAMPLE = 3;

/**
 * Listings needed before the p25 to p75 range is published alongside the
 * median. Between this and MIN_ASKING_SAMPLE an entity shows a single figure.
 *
 * Splitting the two thresholds is what keeps the fallback useful. Requiring
 * eight for anything at all left it publishing for 1 entity in 601: an entity
 * with no sold history is obscure, and obscure entities have few live
 * listings too, so the two conditions rule each other out.
 */
const MIN_ASKING_SAMPLE_FOR_RANGE = 8;

/**
 * Widest p75/p25 ratio still treated as one coherent market. Beyond it the
 * result set is measuring more than one thing: short model names match far
 * more than themselves ("Canon EF" pulls in every EF-mount lens, "Sony a7"
 * every a7 variant), and unlike the old scraper there is no relevance pass
 * between the search and the estimate. The median survives that better than
 * the range does, so a wide sample keeps its midpoint and loses its bounds.
 */
const MAX_ASKING_SPREAD = 4;

/**
 * Write an estimate derived from the most recent asking snapshot, correcting
 * for the markup sellers ask over what buyers pay.
 *
 * The p25–p75 span becomes the headline range and the corrected median the
 * point estimate. No condition tiers: the Browse API grades everything
 * "Used", and inventing Fair/Good/Excellent bands out of one bucket would
 * dress a guess up as a measurement.
 *
 * Returns false when there is no snapshot to work from.
 */
async function upsertFromAsking(
  entityType: string,
  entityId: number,
): Promise<boolean> {
  const [snapshot] = await db
    .select({
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
      ),
    )
    .orderBy(desc(ebayAskingSnapshots.observedOn))
    .limit(1);

  if (!snapshot?.medianUsd) return false;
  if (snapshot.sampleCount < MIN_ASKING_SAMPLE) return false;

  const correct = (v: number | null) =>
    v == null ? null : Math.round(v / ASKING_TO_SOLD_RATIO);

  // The range needs both a big enough sample for percentiles to mean anything
  // and a spread narrow enough to be one market rather than several. Failing
  // either, the entity shows its median alone, which is honest about what a
  // handful of listings can actually tell you.
  const spread =
    snapshot.p25Usd && snapshot.p75Usd ? snapshot.p75Usd / snapshot.p25Usd : null;
  const rangeIsCoherent =
    snapshot.sampleCount >= MIN_ASKING_SAMPLE_FOR_RANGE &&
    spread != null &&
    spread <= MAX_ASKING_SPREAD;

  const now = new Date();
  const values = {
    sourceName: "eBay",
    priceAverageLow: rangeIsCoherent ? correct(snapshot.p25Usd) : null,
    priceAverageHigh: rangeIsCoherent ? correct(snapshot.p75Usd) : null,
    priceVeryGoodLow: null,
    priceVeryGoodHigh: null,
    priceMintLow: null,
    priceMintHigh: null,
    medianPrice: correct(snapshot.medianUsd),
    priceSource: "asking",
    extractedAt: now,
  };

  await db
    .insert(priceEstimates)
    .values({ entityType, entityId, ...values })
    .onConflictDoUpdate({
      target: [priceEstimates.entityType, priceEstimates.entityId],
      set: values,
    });

  revalidateTag(priceTag(entityType, entityId), "max");
  return true;
}

/**
 * Clear an asking-derived estimate that no longer earns its place, so a
 * figure published under a looser rule does not simply sit there once the
 * rule tightens. Sold-derived estimates are deliberately left alone: a lens
 * with no sale this year still has its history behind it, whereas an asking
 * estimate is only ever as good as today's listings.
 */
async function retractAskingEstimate(
  entityType: string,
  entityId: number,
): Promise<void> {
  await db
    .update(priceEstimates)
    .set({
      priceAverageLow: null,
      priceAverageHigh: null,
      priceVeryGoodLow: null,
      priceVeryGoodHigh: null,
      priceMintLow: null,
      priceMintHigh: null,
      medianPrice: null,
      extractedAt: new Date(),
    })
    .where(
      and(
        eq(priceEstimates.entityType, entityType),
        eq(priceEstimates.entityId, entityId),
        eq(priceEstimates.priceSource, "asking"),
      ),
    );
  revalidateTag(priceTag(entityType, entityId), "max");
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

  // A handful of sales is a worse estimate than a 200-listing asking sample,
  // so sold data only takes over once there is enough of it. This is the
  // promotion rule: every lens starts on asking and graduates to sold.
  if (rows.length < MIN_SOLD_SALES_FOR_ESTIMATE) {
    if (await upsertFromAsking(entityType, entityId)) return;
    // The asking sample was too thin or too incoherent to publish. Anything
    // written from an earlier, looser reading has to come down.
    await retractAskingEstimate(entityType, entityId);
  }

  // No sales and no asking sample: upsert a bare tracking row so the entity
  // still rotates out of the never-checked queue.
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
    const cond = row.condition;
    // Sales resolved through the Browse API carry no grade: eBay reports a
    // bare "Used", and the old pipeline only had grades because an LLM read
    // the seller's wording off the sold page. An ungraded sale still counts
    // toward the median, but bucketing it would invent a condition tier —
    // and the `else` below would quietly file every one of them as Fair.
    if (cond == null || cond === "") continue;
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
      priceSource: "sold",
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
        priceSource: "sold",
        extractedAt: now,
      },
    });

  revalidateTag(priceTag(entityType, entityId), "max");
}
