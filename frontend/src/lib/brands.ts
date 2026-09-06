import { unstable_cache } from "next/cache";
import { cache } from "react";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses, lensSystems, systems } from "@/db/schema";

export type BrandSummary = {
  name: string;
  slug: string;
  lensCount: number;
  earliestYear: number | null;
  latestYear: number | null;
};

/** Brands are free text on the lens row; there is no brand table to key off. */
export function brandSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Both fetchers are wrapped in React cache() at the bottom of the file:
// generateMetadata and the page each ask for the brand, and on a data-cache
// miss that used to run every query twice per render.
const _getBrands = unstable_cache(
  async (): Promise<BrandSummary[]> => {
    const rows = await db
      .select({
        name: lenses.brand,
        lensCount: sql<number>`count(*)::int`,
        earliestYear: sql<number | null>`min(${lenses.yearIntroduced})`,
        latestYear: sql<number | null>`max(${lenses.yearIntroduced})`,
      })
      .from(lenses)
      .where(and(isNull(lenses.mergedIntoId), sql`${lenses.brand} is not null`))
      .groupBy(lenses.brand)
      .orderBy(desc(sql`count(*)`));

    return rows
      .filter((r): r is typeof r & { name: string } => r.name != null)
      .map((r) => ({
        name: r.name,
        slug: brandSlug(r.name),
        lensCount: r.lensCount,
        earliestYear: r.earliestYear,
        latestYear: r.latestYear,
      }));
  },
  ["brands"],
  { revalidate: 604800, tags: ["lenses"] },
);

export type BrandPage = {
  brand: BrandSummary;
  /** Mounts this maker built for, most-used first. */
  mounts: { name: string; slug: string; count: number }[];
  lenses: {
    id: number;
    name: string;
    slug: string;
    focalLengthMin: number | null;
    focalLengthMax: number | null;
    apertureMin: number | null;
    yearIntroduced: number | null;
    isZoom: boolean | null;
  }[];
};

const _getBrandBySlug = unstable_cache(
  async (slug: string): Promise<BrandPage | null> => {
    const brands = await _getBrands();
    const brand = brands.find((b) => b.slug === slug);
    if (!brand) return null;

    const [mountRows, lensRows] = await Promise.all([
      db
        .select({
          name: systems.name,
          slug: systems.slug,
          count: sql<number>`count(*)::int`,
        })
        .from(lenses)
        .innerJoin(lensSystems, eq(lensSystems.lensId, lenses.id))
        .innerJoin(systems, eq(systems.id, lensSystems.systemId))
        .where(and(eq(lenses.brand, brand.name), isNull(lenses.mergedIntoId)))
        .groupBy(systems.id, systems.name, systems.slug)
        .orderBy(desc(sql`count(*)`))
        .limit(12),
      db
        .select({
          id: lenses.id,
          name: lenses.name,
          slug: lenses.slug,
          focalLengthMin: lenses.focalLengthMin,
          focalLengthMax: lenses.focalLengthMax,
          apertureMin: lenses.apertureMin,
          yearIntroduced: lenses.yearIntroduced,
          isZoom: lenses.isZoom,
        })
        .from(lenses)
        .where(and(eq(lenses.brand, brand.name), isNull(lenses.mergedIntoId)))
        .orderBy(sql`${lenses.yearIntroduced} desc nulls last`, asc(lenses.name))
        .limit(500),
    ]);

    return { brand, mounts: mountRows, lenses: lensRows };
  },
  ["brand-by-slug"],
  { revalidate: 604800, tags: ["lenses"] },
);

export const getBrands = cache(_getBrands);
export const getBrandBySlug = cache(_getBrandBySlug);
