import { db } from "@/db";
import { lenses, systems, lensSeries, lensSystems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import LensList from "@/components/LensList";
import { PageTransition } from "@/components/page-transition";
import { listLenses, type LensListItem } from "@/lib/lens-list";

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
        .innerJoin(lensSystems, eq(lensSystems.systemId, systems.id))
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
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
}>;

export default async function LensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  let initialItems: LensListItem[] = [];
  let total = 0;
  let nextCursor: number | null = null;
  let brands: string[] = [];
  let systemList: { name: string; slug: string }[] = [];
  let seriesList: { name: string; slug: string }[] = [];

  try {
    // Fetch cached dropdown data (brands + systems)
    const dropdownData = await getCachedDropdownData();
    brands = dropdownData.brands;
    systemList = dropdownData.systems;
    seriesList = dropdownData.series;

    const result = await listLenses({
      q: params.q,
      brand: params.brand,
      system: params.system,
      coverage: params.coverage,
      type: params.type,
      minFocal: params.minFocal,
      maxFocal: params.maxFocal,
      minAperture: params.minAperture,
      maxAperture: params.maxAperture,
      year: params.year,
      lensType: params.lensType,
      era: params.era,
      productionStatus: params.productionStatus,
      series: params.series,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      sort: params.sort,
      order: params.order,
      cursor: 0,
    });
    initialItems = result.items;
    total = result.total;
    nextCursor = result.nextCursor;
  } catch {
    // DB not connected
  }

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
