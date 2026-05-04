import { db } from "@/db";
import { lenses, systems, lensSeries, lensSeriesMemberships, priceEstimates } from "@/db/schema";
import { asc, desc, eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import LensList from "@/components/LensList";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";
import { ArrowRight } from "lucide-react";

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
  hasAutofocus?: string;
  priceMin?: string;
  priceMax?: string;
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
    avgPrice: number | null;
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

    const avgPrice = priceEstimates.medianPrice;

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
    if (params.hasAutofocus === "true") {
      conditions.push(eq(lenses.hasAutofocus, true));
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
    if (params.priceMin) {
      const val = parseInt(params.priceMin);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} >= ${val}`);
    }
    if (params.priceMax) {
      const val = parseInt(params.priceMax);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} <= ${val}`);
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
      price: avgPrice,
    };
    const sortKey = params.sort || "";
    const sortCol = sortColumns[sortKey] || lenses.name;
    const orderFn = params.order === "desc" ? desc : asc;
    const sortByName = sortCol === lenses.name;
    const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
    const orderClauses = sortByName
      ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
      : sortKey === "price"
      ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
      : [orderFn(sortCol)];

    // When filtering by system, we need a join for the WHERE clause
    const needsSystemJoin = !!params.system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(systems, eq(lenses.systemId, systems.id))
          .leftJoin(priceEstimates, and(
            eq(priceEstimates.entityType, "lens"),
            eq(priceEstimates.entityId, lenses.id),
          ))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(priceEstimates, and(
            eq(priceEstimates.entityType, "lens"),
            eq(priceEstimates.entityId, lenses.id),
          ))
          .where(where);
    total = Number(countResult.count);

    const rawItems = await db
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

  const activeFilterSummary: string[] = [];
  if (params.type) activeFilterSummary.push(params.type);
  if (params.coverage) activeFilterSummary.push(params.coverage.replace(/-/g, " "));
  if (params.brand) activeFilterSummary.push(params.brand);
  if (params.minFocal || params.maxFocal)
    activeFilterSummary.push(
      params.minFocal && params.maxFocal
        ? `${params.minFocal}–${params.maxFocal}mm`
        : `${params.minFocal ?? params.maxFocal}mm`,
    );
  if (params.minAperture) activeFilterSummary.push(`ƒ/${params.minAperture}+`);
  if (params.hasAutofocus === "true") activeFilterSummary.push("autofocus");

  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "home", href: "/" }, { label: "lenses" }]} />

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        <div className="mb-6 grid items-end gap-6 border-b border-border pb-5 lg:grid-cols-[1fr_auto]">
          <div>
            <h1 className="text-[36px] font-medium leading-none -tracking-[0.025em]">Lenses</h1>
            <div className="mono mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--fg-dim)]">
              <span>
                <span className="text-foreground">{total.toLocaleString()}</span>{" "}
                {total === 1 ? "result" : "results"}
              </span>
              {activeFilterSummary.length > 0 && (
                <>
                  <span className="text-[var(--fg-faint)]">·</span>
                  <span>
                    filtered by{" "}
                    <span className="text-foreground">
                      {activeFilterSummary.join(" · ")}
                    </span>
                  </span>
                </>
              )}
              <span className="text-[var(--fg-faint)]">·</span>
              <span>
                Browse by{" "}
                <Link
                  href="/lenses/series"
                  className="text-foreground underline decoration-[var(--line-strong)] underline-offset-[3px] hover:decoration-foreground"
                >
                  series
                  <ArrowRight className="ml-0.5 inline size-3" />
                </Link>
              </span>
            </div>
          </div>
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
