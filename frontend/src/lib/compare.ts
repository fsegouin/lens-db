import { unstable_cache } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses } from "@/db/schema";
import type { ComparableLens } from "@/lib/compare-rows";

/**
 * Which lenses are worth a published comparison, and how a pair is addressed.
 *
 * "X vs Y" is one of the largest query classes in this subject, and today the
 * site answers it only behind a query string that is marked noindex. The set
 * cannot be every pair: 9,257 lenses make 42 million of them, and a page per
 * pair with nothing to say is a doorway. It cannot come from what visitors
 * have compared either, since only 54 pairs have ever been recorded.
 *
 * So a pair earns a page when the two lenses are genuinely cross-shopped:
 * they mount on the same body, cover the same focal length, sit within a stop
 * of each other, are both macro or both not, and each has actually traded
 * enough times to have a used price worth quoting. That yields a few thousand
 * pages, each carrying two full spec sets and two price ranges.
 */
const MIN_SALES_FOR_PAIR = 20;

/** Aperture ratio inside which two lenses are the same class of thing. */
const APERTURE_TOLERANCE = 1.45;

export type LensPair = { slug1: string; slug2: string };

export const getComparableLensPairs = unstable_cache(
  async (): Promise<LensPair[]> => {
    const result = await db.execute(sql`
      with traded as (
        select l.id, l.slug,
               l.focal_length_min fmin,
               coalesce(l.focal_length_max, l.focal_length_min) fmax,
               l.aperture_min ap,
               coalesce(l.is_macro, false) macro,
               (select count(*)::int from price_history ph
                 where ph.entity_type = 'lens' and ph.entity_id = l.id
                   and ph.price_usd >= 5) sales
        from lenses l
        where l.merged_into_id is null
          and l.focal_length_min is not null
          and l.aperture_min is not null
      )
      select distinct a.slug slug1, b.slug slug2
      from traded a
      join lens_systems lsa on lsa.lens_id = a.id
      join lens_systems lsb on lsb.system_id = lsa.system_id
      join traded b on b.id = lsb.lens_id
      where a.id < b.id
        and a.fmin = b.fmin
        and a.fmax = b.fmax
        and greatest(a.ap, b.ap) / least(a.ap, b.ap) <= ${APERTURE_TOLERANCE}
        and a.macro = b.macro
        and a.sales >= ${MIN_SALES_FOR_PAIR}
        and b.sales >= ${MIN_SALES_FOR_PAIR}
    `);

    return (result.rows as { slug1: string; slug2: string }[]).map((r) => ({
      slug1: r.slug1,
      slug2: r.slug2,
    }));
  },
  ["comparable-lens-pairs"],
  { revalidate: 604800, tags: ["lenses"] },
);

export type LensRival = {
  id: number;
  name: string;
  slug: string;
  sales: number;
};

/**
 * The rivals of one lens, most-traded first. Sitemap entries alone leave the
 * comparison pages orphaned, so each lens page links to its own.
 */
export const getRivalsForLens = unstable_cache(
  async (lensId: number): Promise<LensRival[]> => {
    const result = await db.execute(sql`
      with subject as (
        select l.id,
               l.focal_length_min fmin,
               coalesce(l.focal_length_max, l.focal_length_min) fmax,
               l.aperture_min ap,
               coalesce(l.is_macro, false) macro
        from lenses l
        where l.id = ${lensId} and l.merged_into_id is null
      )
      select b.id, b.name, b.slug,
             (select count(*)::int from price_history ph
               where ph.entity_type = 'lens' and ph.entity_id = b.id
                 and ph.price_usd >= 5) sales
      from subject s
      join lens_systems lsa on lsa.lens_id = s.id
      join lens_systems lsb on lsb.system_id = lsa.system_id
      join lenses b on b.id = lsb.lens_id
      where b.id <> s.id
        and b.merged_into_id is null
        and b.focal_length_min = s.fmin
        and coalesce(b.focal_length_max, b.focal_length_min) = s.fmax
        and b.aperture_min is not null
        and greatest(b.aperture_min, s.ap) / least(b.aperture_min, s.ap) <= ${APERTURE_TOLERANCE}
        and coalesce(b.is_macro, false) = s.macro
      group by b.id, b.name, b.slug
      having (select count(*)::int from price_history ph
                where ph.entity_type = 'lens' and ph.entity_id = b.id
                  and ph.price_usd >= 5) >= ${MIN_SALES_FOR_PAIR}
      order by sales desc, b.name
      limit 6
    `);
    return result.rows as LensRival[];
  },
  ["rivals-for-lens"],
  { revalidate: 604800, tags: ["lenses"] },
);

const COMPARE_FIELDS = {
  id: lenses.id,
  name: lenses.name,
  slug: lenses.slug,
  brand: lenses.brand,
  focalLengthMin: lenses.focalLengthMin,
  focalLengthMax: lenses.focalLengthMax,
  apertureMin: lenses.apertureMin,
  apertureMax: lenses.apertureMax,
  weightG: lenses.weightG,
  filterSizeMm: lenses.filterSizeMm,
  minFocusDistanceM: lenses.minFocusDistanceM,
  maxMagnification: lenses.maxMagnification,
  lensElements: lenses.lensElements,
  lensGroups: lenses.lensGroups,
  diaphragmBlades: lenses.diaphragmBlades,
  yearIntroduced: lenses.yearIntroduced,
  isZoom: lenses.isZoom,
  isMacro: lenses.isMacro,
  isPrime: lenses.isPrime,
  hasStabilization: lenses.hasStabilization,
  hasAutofocus: lenses.hasAutofocus,
  lensType: lenses.lensType,
  era: lenses.era,
  productionStatus: lenses.productionStatus,
  specs: lenses.specs,
};

/** Both sides of a comparison in one query, still in canonical id order. */
export const getLensesForCompare = unstable_cache(
  async (slugs: string[]): Promise<ComparableLens[]> => {
    if (slugs.length === 0) return [];
    const rows = await db
      .select(COMPARE_FIELDS)
      .from(lenses)
      .where(and(inArray(lenses.slug, slugs), isNull(lenses.mergedIntoId)))
      .orderBy(lenses.id);
    return rows as ComparableLens[];
  },
  ["lenses-for-compare"],
  { revalidate: 604800, tags: ["lenses"] },
);

/** Follows a merged lens to its survivor, so old pair links keep working. */
export const getCompareRedirectSlug = unstable_cache(
  async (slug: string): Promise<string | null> => {
    const [row] = await db
      .select({ mergedIntoId: lenses.mergedIntoId })
      .from(lenses)
      .where(eq(lenses.slug, slug))
      .limit(1);
    if (!row?.mergedIntoId) return null;
    const [survivor] = await db
      .select({ slug: lenses.slug })
      .from(lenses)
      .where(eq(lenses.id, row.mergedIntoId))
      .limit(1);
    return survivor?.slug ?? null;
  },
  ["compare-redirect-slug"],
  { revalidate: 604800, tags: ["lenses"] },
);

/**
 * "a-vs-b" into its two slugs. Lens slugs contain hyphens and could in
 * principle contain "-vs-", so every split point is offered rather than
 * assuming the first one is right; the caller resolves which pair exists.
 */
export function splitPairSlug(pair: string): [string, string][] {
  const out: [string, string][] = [];
  const sep = "-vs-";
  let i = pair.indexOf(sep);
  while (i !== -1) {
    out.push([pair.slice(0, i), pair.slice(i + sep.length)]);
    i = pair.indexOf(sep, i + 1);
  }
  return out;
}

/** Which of two lenses wins on a measure where less, or more, is better. */
export function betterOf(
  a: number | null | undefined,
  b: number | null | undefined,
  lowerIsBetter: boolean,
): "a" | "b" | null {
  if (a == null || b == null || a === b) return null;
  const aWins = lowerIsBetter ? a < b : a > b;
  return aWins ? "a" : "b";
}
