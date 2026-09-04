import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { lenses, systems, lensSeries, lensSeriesMemberships, lensSystems, priceEstimates } from "@/db/schema";
import { asc, desc, eq, and, gte, lte, sql, inArray, isNull, type AnyColumn } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";
import {
  normalizeCoverage,
  normalizeEra,
  normalizeLensType,
  normalizeProductionStatus,
} from "@/lib/vocabularies";

const PAGE_SIZE = 50;

export type LensListParams = {
  q?: string;
  slug?: string;
  brand?: string;
  system?: string;
  coverage?: string;
  type?: string;
  minFocal?: string;
  maxFocal?: string;
  minAperture?: string;
  maxAperture?: string;
  year?: string;
  lensType?: string;
  era?: string;
  productionStatus?: string;
  series?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
  cursor: number;
};

/**
 * Two columns are omitted at the type level, not merely stripped at runtime,
 * so a future caller cannot reach for them: `url` is the import source and
 * `submittedByIp` is a hash of a contributor's address. Neither belongs in a
 * payload the browser receives.
 */
export type LensListItem = {
  lens: Omit<typeof lenses.$inferSelect, "url" | "submittedByIp">;
  system: typeof systems.$inferSelect | null;
  avgPrice: number | null;
  series: { name: string; slug: string }[];
  // Every mount the lens is sold in (lens_systems), primary first.
  mounts: { name: string; slug: string }[];
};

export type LensListResult = {
  items: LensListItem[];
  nextCursor: number | null;
  total: number;
};

// Shared by the /lenses page and /api/lenses. Cached for an hour so
// repeated identical requests (list pages are the most-crawled paths)
// don't each hit Postgres; admin edits bust the "lenses" tag.
export const listLenses = unstable_cache(
  async (p: LensListParams): Promise<LensListResult> => {
    const cursor = p.cursor;
    const avgPrice = priceEstimates.medianPrice;

    const conditions: ReturnType<typeof and>[] = [isNull(lenses.mergedIntoId)];

    if (p.q) {
      // Shared with the header typeahead and /search, so all three agree on
      // what a query like "50mm 1.4" means.
      for (const condition of buildNameSearch(lenses.name, p.q)) {
        conditions.push(condition);
      }
    }
    if (p.slug) {
      conditions.push(eq(lenses.slug, p.slug));
    }
    if (p.brand) {
      conditions.push(eq(lenses.brand, p.brand));
    }
    if (p.system) {
      // Match any mount the lens is sold in, not just the primary one.
      conditions.push(
        sql`${lenses.id} IN (
          SELECT ${lensSystems.lensId} FROM ${lensSystems}
          JOIN ${systems} ON ${systems.id} = ${lensSystems.systemId}
          WHERE ${systems.slug} = ${p.system}
        )`
      );
    }
    // Filter values go through the same normaliser as the stored ones, so a
    // link written before the vocabularies were settled still matches.
    const coverage = normalizeCoverage(p.coverage);
    if (coverage) {
      conditions.push(eq(lenses.coverage, coverage));
    }
    if (p.type === "zoom") {
      conditions.push(eq(lenses.isZoom, true));
    } else if (p.type === "prime") {
      conditions.push(eq(lenses.isPrime, true));
    } else if (p.type === "macro") {
      conditions.push(eq(lenses.isMacro, true));
    }
    if (p.minFocal) {
      const val = parseFloat(p.minFocal);
      if (Number.isFinite(val)) conditions.push(gte(lenses.focalLengthMin, val));
    }
    if (p.maxFocal) {
      const val = parseFloat(p.maxFocal);
      if (Number.isFinite(val)) conditions.push(lte(lenses.focalLengthMax, val));
    }
    if (p.minAperture) {
      const val = parseFloat(p.minAperture);
      if (Number.isFinite(val)) conditions.push(gte(lenses.apertureMin, val));
    }
    if (p.maxAperture) {
      const val = parseFloat(p.maxAperture);
      if (Number.isFinite(val)) conditions.push(lte(lenses.apertureMin, val));
    }
    if (p.year) {
      const val = parseInt(p.year);
      if (Number.isFinite(val)) conditions.push(eq(lenses.yearIntroduced, val));
    }
    const lensType = normalizeLensType(p.lensType);
    if (lensType) {
      conditions.push(eq(lenses.lensType, lensType));
    }
    const era = normalizeEra(p.era);
    if (era) {
      conditions.push(eq(lenses.era, era));
    }
    const productionStatus = normalizeProductionStatus(p.productionStatus);
    if (productionStatus) {
      conditions.push(eq(lenses.productionStatus, productionStatus));
    }
    if (p.priceMin) {
      const val = parseInt(p.priceMin);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} >= ${val}`);
    }
    if (p.priceMax) {
      const val = parseInt(p.priceMax);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} <= ${val}`);
    }
    if (p.series) {
      conditions.push(
        sql`${lenses.id} IN (
          SELECT ${lensSeriesMemberships.lensId} FROM ${lensSeriesMemberships}
          JOIN ${lensSeries} ON ${lensSeries.id} = ${lensSeriesMemberships.seriesId}
          WHERE ${lensSeries.slug} = ${p.series}
        )`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumns: Record<string, AnyColumn> = {
      name: lenses.name,
      brand: lenses.brand,
      system: systems.name,
      focalLength: lenses.focalLengthMin,
      aperture: lenses.apertureMin,
      year: lenses.yearIntroduced,
      weight: lenses.weightG,
      rating: lenses.averageRating,
      price: avgPrice,
    };
    // Default: newest first, unknown years last, then alphabetical. Year sorts
    // descend unless the caller asks otherwise; every other column ascends.
    const sortKey = p.sort || "year";
    const sortCol = sortColumns[sortKey] || lenses.name;
    const defaultOrder = sortKey === "year" ? "desc" : "asc";
    const orderFn = (p.order || defaultOrder) === "desc" ? desc : asc;
    const sortByName = sortCol === lenses.name;
    // When sorting by name, sort by the name prefix (before focal length), then focal length numerically
    const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
    // Other sorts break ties the same way name sorting orders rows, so equal
    // years / prices / weights come out alphabetically.
    const nameTieBreak = [asc(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)];
    // For price and year sorting, push NULLs to the end regardless of direction
    const orderClauses = sortByName
      ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
      : sortKey === "price"
      ? [sql`${avgPrice} IS NULL`, orderFn(sortCol), ...nameTieBreak]
      : sortKey === "year"
      ? [sql`${lenses.yearIntroduced} IS NULL`, orderFn(sortCol), ...nameTieBreak]
      : [orderFn(sortCol), ...nameTieBreak];

    const itemsPromise = db
      .select({ lens: lenses, system: systems, avgPrice: avgPrice })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id),
      ))
      .where(where)
      .orderBy(...orderClauses)
      .limit(PAGE_SIZE)
      .offset(cursor);

    // Total only matters for the SSR-rendered first page (cursor=0).
    // Cursor pagination from the client already has total from SSR.
    const countPromise =
      cursor === 0
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(lenses)
            .leftJoin(priceEstimates, and(
              eq(priceEstimates.entityType, "lens"),
              eq(priceEstimates.entityId, lenses.id),
            ))
            .where(where)
        : null;

    const [items, countRows] = await Promise.all([
      itemsPromise,
      countPromise,
    ]);

    const total = countRows ? Number(countRows[0].count) : -1;
    const nextCursor =
      items.length === PAGE_SIZE ? cursor + PAGE_SIZE : null;

    // Fetch series and mounts for the returned lenses
    const lensIds = items.map((r) => r.lens.id);
    const seriesMap: Record<number, { name: string; slug: string }[]> = {};
    const mountsMap: Record<number, { name: string; slug: string }[]> = {};
    if (lensIds.length > 0) {
      const [seriesRows, mountRows] = await Promise.all([
        db
          .select({
            lensId: lensSeriesMemberships.lensId,
            name: lensSeries.name,
            slug: lensSeries.slug,
          })
          .from(lensSeriesMemberships)
          .innerJoin(lensSeries, eq(lensSeriesMemberships.seriesId, lensSeries.id))
          .where(inArray(lensSeriesMemberships.lensId, lensIds)),
        db
          .select({
            lensId: lensSystems.lensId,
            systemId: lensSystems.systemId,
            name: systems.name,
            slug: systems.slug,
          })
          .from(lensSystems)
          .innerJoin(systems, eq(lensSystems.systemId, systems.id))
          .where(inArray(lensSystems.lensId, lensIds))
          .orderBy(asc(systems.name)),
      ]);
      for (const row of seriesRows) {
        if (!seriesMap[row.lensId]) seriesMap[row.lensId] = [];
        seriesMap[row.lensId].push({ name: row.name, slug: row.slug });
      }
      const primaryOf = new Map(items.map((r) => [r.lens.id, r.lens.systemId]));
      for (const row of mountRows) {
        if (!mountsMap[row.lensId]) mountsMap[row.lensId] = [];
        const entry = { name: row.name, slug: row.slug };
        if (row.systemId === primaryOf.get(row.lensId)) mountsMap[row.lensId].unshift(entry);
        else mountsMap[row.lensId].push(entry);
      }
    }

    // The query selects the whole lens row, so two columns that have no
    // business leaving the server ride along with it: `url`, which holds the
    // import source, and `submittedByIp`, which is a hash of a contributor's
    // address. Both were being serialised into the payload of every list page
    // and every /api/lenses response, once per lens.
    const itemsWithRelations = items.map(({ lens, ...r }) => {
      const { url: _url, submittedByIp: _ip, ...safeLens } = lens;
      return {
        ...r,
        lens: safeLens,
        series: seriesMap[lens.id] || [],
        mounts: mountsMap[lens.id] || [],
      };
    });

    return { items: itemsWithRelations, nextCursor, total };
  },
  ["lens-list-v2"],
  { revalidate: 3600, tags: ["lenses"] }
);
