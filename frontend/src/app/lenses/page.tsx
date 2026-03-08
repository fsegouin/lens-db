import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { asc, eq, and, gte, lte, ilike, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import LensList from "@/components/LensList";

const getCachedDropdownData = unstable_cache(
  async () => {
    const [brandRows, systemRows] = await Promise.all([
      db
        .selectDistinct({ brand: lenses.brand })
        .from(lenses)
        .orderBy(asc(lenses.brand)),
      db
        .select({ name: systems.name, slug: systems.slug })
        .from(systems)
        .orderBy(asc(systems.name)),
    ]);
    return {
      brands: brandRows
        .map((r) => r.brand)
        .filter((b): b is string => b != null),
      systems: systemRows,
    };
  },
  ["lenses-dropdown-data"],
  { revalidate: 86400 }
);

export const metadata = {
  title: "Lenses | Lens DB",
  description: "Search and filter camera lenses by specs, system, and type.",
};

type SearchParams = Promise<{
  system?: string;
  type?: string;
  brand?: string;
  q?: string;
  minFocal?: string;
  maxFocal?: string;
  aperture?: string;
  year?: string;
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
  }[] = [];
  let total = 0;
  let brands: string[] = [];
  let systemList: { name: string; slug: string }[] = [];

  try {
    // Fetch cached dropdown data (brands + systems)
    const dropdownData = await getCachedDropdownData();
    brands = dropdownData.brands;
    systemList = dropdownData.systems;

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
    if (params.aperture) {
      conditions.push(eq(lenses.apertureMin, parseFloat(params.aperture)));
    }
    if (params.year) {
      conditions.push(eq(lenses.yearIntroduced, parseInt(params.year)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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

    initialItems = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(where)
      .orderBy(asc(lenses.name))
      .limit(PAGE_SIZE)
      .offset(0);
  } catch {
    // DB not connected
  }

  const nextCursor = PAGE_SIZE < total ? PAGE_SIZE : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Lenses
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {total > 0
            ? `${total} lenses found`
            : "Search and filter 7,400+ camera lenses"}
        </p>
      </div>

      <LensList
        initialItems={initialItems}
        initialTotal={total}
        initialNextCursor={nextCursor}
        brands={brands}
        systems={systemList}
      />
    </div>
  );
}
