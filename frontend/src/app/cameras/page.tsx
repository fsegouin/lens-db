import Link from "next/link";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, eq, ilike, and, sql } from "drizzle-orm";

export const metadata = {
  title: "Cameras | Lens DB",
  description: "Browse camera bodies by system and specifications.",
};

type SearchParams = Promise<{
  q?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  let allCameras: {
    camera: typeof cameras.$inferSelect;
    system: typeof systems.$inferSelect | null;
  }[] = [];
  let total = 0;

  try {
    const conditions = [];
    if (params.q) {
      conditions.push(ilike(cameras.name, `%${params.q}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cameras)
      .where(where);
    total = Number(countResult.count);

    allCameras = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(asc(cameras.name))
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
          Cameras
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {total > 0 ? `${total} cameras found` : "Browse camera bodies"}
        </p>
      </div>

      <form className="flex flex-wrap gap-3" method="GET">
        <input
          type="text"
          name="q"
          placeholder="Search cameras..."
          defaultValue={params.q}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Search
        </button>
      </form>

      {allCameras.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allCameras.map(({ camera, system }) => (
              <Link
                key={camera.id}
                href={`/cameras/${camera.slug}`}
                className="rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {camera.name}
                </h2>
                {system && (
                  <p className="mt-1 text-sm text-zinc-500">{system.name}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                  {camera.sensorSize && <span>{camera.sensorSize}</span>}
                  {camera.megapixels && <span>{camera.megapixels}MP</span>}
                  {camera.yearIntroduced && (
                    <span>{camera.yearIntroduced}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={`/cameras?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
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
                  href={`/cameras?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
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
            No cameras found. Run the scraper to populate the database.
          </p>
        </div>
      )}
    </div>
  );
}
