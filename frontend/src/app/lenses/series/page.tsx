import Link from "next/link";
import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { lensSeries, lensSeriesMemberships } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const revalidate = 604800;

export const metadata = {
  title: "Lens Series | The Lens DB",
  description: "Product lines and series from major lens manufacturers.",
};

export default async function LensSeriesPage() {
  let allSeries: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    lensCount: number;
  }[] = [];

  try {
    const rows = await db
      .select({
        id: lensSeries.id,
        name: lensSeries.name,
        slug: lensSeries.slug,
        description: lensSeries.description,
        lensCount: sql<number>`count(${lensSeriesMemberships.lensId})::integer`,
      })
      .from(lensSeries)
      .leftJoin(lensSeriesMemberships, eq(lensSeries.id, lensSeriesMemberships.seriesId))
      .groupBy(lensSeries.id)
      .having(gt(sql`count(${lensSeriesMemberships.lensId})`, 0))
      .orderBy(asc(lensSeries.name));
    allSeries = rows;
  } catch {
    // DB not connected
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Lens Series
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Product lines and series from major lens manufacturers.
          </p>
        </div>

        {allSeries.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSeries.map((series) => (
              <Link
                key={series.id}
                href={`/lenses/series/${series.slug}`}
                className="rounded-lg border border-zinc-200 p-4 transition-all duration-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {series.name}
                </h2>
                {series.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {series.description}
                  </p>
                )}
                <div className="mt-3">
                  <Badge variant="secondary">
                    {series.lensCount} {series.lensCount === 1 ? "lens" : "lenses"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-zinc-500">No lens series yet.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
