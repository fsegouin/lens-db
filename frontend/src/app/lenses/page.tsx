import Link from "next/link";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { asc, eq, and, gte, lte, ilike, sql } from "drizzle-orm";

export const metadata = {
  title: "Lenses | Lens DB",
  description: "Search and filter camera lenses by specs, system, and type.",
};

type SearchParams = Promise<{
  system?: string;
  type?: string;
  q?: string;
  minFocal?: string;
  maxFocal?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;

export default async function LensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  let allLenses: {
    lens: typeof lenses.$inferSelect;
    system: typeof systems.$inferSelect | null;
  }[] = [];
  let total = 0;

  try {
    const conditions = [];

    if (params.q) {
      conditions.push(ilike(lenses.name, `%${params.q}%`));
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

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(lenses)
      .where(where);
    total = Number(countResult.count);

    allLenses = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(where)
      .orderBy(asc(lenses.name))
      .limit(PAGE_SIZE)
      .offset(offset);
  } catch {
    // DB not connected
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Lenses
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {total > 0 ? `${total} lenses found` : "Search and filter 7,400+ camera lenses"}
        </p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <input
          type="text"
          name="q"
          placeholder="Search lenses..."
          defaultValue={params.q}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="type"
          defaultValue={params.type}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All types</option>
          <option value="prime">Prime</option>
          <option value="zoom">Zoom</option>
          <option value="macro">Macro</option>
        </select>
        <input
          type="number"
          name="minFocal"
          placeholder="Min focal (mm)"
          defaultValue={params.minFocal}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          name="maxFocal"
          placeholder="Max focal (mm)"
          defaultValue={params.maxFocal}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

      {/* Results */}
      {allLenses.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">System</th>
                  <th className="pb-3 pr-4 font-medium">Focal Length</th>
                  <th className="pb-3 pr-4 font-medium">Aperture</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {allLenses.map(({ lens, system }) => (
                  <tr
                    key={lens.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/lenses/${lens.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {lens.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {system?.name || "—"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {lens.focalLengthMin
                        ? lens.focalLengthMin === lens.focalLengthMax
                          ? `${lens.focalLengthMin}mm`
                          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {lens.apertureMin ? `f/${lens.apertureMin}` : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      {lens.isZoom && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Zoom
                        </span>
                      )}
                      {lens.isPrime && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                          Prime
                        </span>
                      )}
                      {lens.isMacro && (
                        <span className="ml-1 rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                          Macro
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {lens.weightG ? `${lens.weightG}g` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={`/lenses?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700"
                >
                  Previous
                </Link>
              )}
              <span className="text-sm text-zinc-500">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/lenses?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No lenses found. Run the scraper to populate the database.
          </p>
        </div>
      )}
    </div>
  );
}
