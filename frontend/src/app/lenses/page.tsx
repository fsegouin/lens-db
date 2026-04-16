import { db } from "@/db";
import { lenses, systems, lensSeries, lensSeriesMemberships } from "@/db/schema";
import { asc, desc, eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import LensList from "@/components/LensList";
import { PageTransition } from "@/components/page-transition";

const getCachedDropdownData = unstable_cache(
  async () => {
    const [brandRows, systemRows, seriesRows] = await Promise.all([
      db
        .selectDistinct({ brand: lenses.brand })
        .from(lenses)
        .orderBy(asc(lenses.brand)),
      db
        .selectDistinct({ name: systems.name, slug: systems.slug })
        .from(systems)
        .innerJoin(lenses, eq(lenses.systemId, systems.id))
        .orderBy(asc(systems.name)),
      db
        .select({ name: lensSeries.name, slug: lensSeries.slug })
        .from(lensSeries)
        .orderBy(asc(lensSeries.name)),
    ]);
    return {
      brands: brandRows
        .map((r) => r.brand)
        .filter((b): b is string => b != null),
      systems: systemRows,
      series: seriesRows,
    };
  },
  ["lenses-dropdown-data"],
  { revalidate: 86400 }
);

export const metadata = {
  title: "Lenses | The Lens DB",
  description: "Search and filter camera lenses by specs, system, and type.",
};

type SearchParams = Promise<{
  system?: string;
  type?: string;
  brand?: string;
  q?: string;
  minFocal?: string;
  maxFocal?: string;
  minAperture?: string;
  maxAperture?: string;
  year?: string;
  lensType?: string;
  era?: string;
  productionStatus?: string;
  coverage?: string;
  series?: string;
  sort?: string;
  order?: string;
}>;

const PAGE_SIZE = 50;

export default async function LensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  let initialItems: {
    lens: typeof lenses.$inferSelect;
    system: typeof systems.$inferSelect | null;
    series: { name: string; slug: string }[];
  }[] = [];
  let total = 0;
  let brands: string[] = [];
  let systemList: { name: string; slug: string }[] = [];
  let seriesList: { name: string; slug: string }[] = [];

  try {
    // Fetch cached dropdown data (brands + systems)
    const dropdownData = await getCachedDropdownData();
    brands = dropdownData.brands;
    systemList = dropdownData.systems;
    seriesList = dropdownData.series;

    const conditions = [];

    if (params.q) {
      const words = params.q.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const startsWithDigit = /^\d/.test(clean);
        const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
        conditions.push(
          sql`regexp_replace(${lenses.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
        );
      }
    }
    if (params.brand) {
      conditions.push(eq(lenses.brand, params.brand));
    }
    if (params.system) {
      conditions.push(eq(systems.slug, params.system));
    }
    if (params.coverage) {
      conditions.push(eq(lenses.coverage, params.coverage));
    }
    if (params.type === "zoom") {
      conditions.push(eq(lenses.isZoom, true));
    } else if (params.type === "prime") {
      conditions.push(eq(lenses.isPrime, true));
    } else if (params.type === "macro") {
      conditions.push(eq(lenses.isMacro, true));
    }
    if (params.minFocal) {
      conditions.push(gte(lenses.focalLengthMin, parseFloat(params.minFocal)));
    }
    if (params.maxFocal) {
      conditions.push(lte(lenses.focalLengthMax, parseFloat(params.maxFocal)));
    }
    if (params.minAperture) {
      conditions.push(gte(lenses.apertureMin, parseFloat(params.minAperture)));
    }
    if (params.maxAperture) {
      conditions.push(lte(lenses.apertureMin, parseFloat(params.maxAperture)));
    }
    if (params.year) {
      conditions.push(eq(lenses.yearIntroduced, parseInt(params.year)));
    }
    if (params.lensType) {
      conditions.push(eq(lenses.lensType, params.lensType));
    }
    if (params.era) {
      conditions.push(eq(lenses.era, params.era));
    }
    if (params.productionStatus) {
      conditions.push(eq(lenses.productionStatus, params.productionStatus));
    }
    if (params.series) {
      conditions.push(
        sql`${lenses.id} IN (
          SELECT ${lensSeriesMemberships.lensId} FROM ${lensSeriesMemberships}
          JOIN ${lensSeries} ON ${lensSeries.id} = ${lensSeriesMemberships.seriesId}
          WHERE ${lensSeries.slug} = ${params.series}
        )`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      name: lenses.name,
      brand: lenses.brand,
      system: systems.name,
      focalLength: lenses.focalLengthMin,
      aperture: lenses.apertureMin,
      year: lenses.yearIntroduced,
      weight: lenses.weightG,
      rating: lenses.averageRating,
    };
    const sortCol = sortColumns[params.sort || ""] || lenses.name;
    const orderFn = params.order === "desc" ? desc : asc;
    const sortByName = sortCol === lenses.name;
    const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
    const orderClauses = sortByName
      ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
      : [orderFn(sortCol)];

    // When filtering by system, we need a join for the WHERE clause
    const needsSystemJoin = !!params.system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(systems, eq(lenses.systemId, systems.id))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .where(where);
    total = Number(countResult.count);

    const rawItems = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(where)
      .orderBy(...orderClauses)
      .limit(PAGE_SIZE)
      .offset(0);

    // Fetch series for the returned lenses
    const lensIds = rawItems.map((r) => r.lens.id);
    const seriesMap: Record<number, { name: string; slug: string }[]> = {};
    if (lensIds.length > 0) {
      const seriesRows = await db
        .select({
          lensId: lensSeriesMemberships.lensId,
          name: lensSeries.name,
          slug: lensSeries.slug,
        })
        .from(lensSeriesMemberships)
        .innerJoin(lensSeries, eq(lensSeriesMemberships.seriesId, lensSeries.id))
        .where(inArray(lensSeriesMemberships.lensId, lensIds));
      for (const row of seriesRows) {
        if (!seriesMap[row.lensId]) seriesMap[row.lensId] = [];
        seriesMap[row.lensId].push({ name: row.name, slug: row.slug });
      }
    }

    initialItems = rawItems.map((r) => ({
      ...r,
      series: seriesMap[r.lens.id] || [],
    }));
  } catch {
    // DB not connected
  }

  const nextCursor = PAGE_SIZE < total ? PAGE_SIZE : null;

  return (
    <PageTransition>
      <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Lenses
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {total > 0
            ? `${total} lenses found`
            : "Search and filter 7,400+ camera lenses"}
          {" · "}
          <Link href="/lenses/series" className="text-zinc-900 underline hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300">
            Browse by series
          </Link>
        </p>
      </div>

      <LensList
        initialItems={initialItems}
        initialTotal={total}
        initialNextCursor={nextCursor}
        brands={brands}
        systems={systemList}
        seriesOptions={seriesList}
      />
      </div>
    </PageTransition>
  );
}
