import Link from "next/link";
import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { collections, lensCollections } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const revalidate = 86400;

export const metadata = {
  title: "Collections | The Lens DB",
  description: "Curated thematic lens collections.",
};

export default async function CollectionsPage() {
  let allCollections: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    lensCount: number;
  }[] = [];

  try {
    const rows = await db
      .select({
        id: collections.id,
        name: collections.name,
        slug: collections.slug,
        description: collections.description,
        lensCount: sql<number>`count(${lensCollections.lensId})::integer`,
      })
      .from(collections)
      .leftJoin(lensCollections, eq(collections.id, lensCollections.collectionId))
      .groupBy(collections.id)
      .having(gt(sql`count(${lensCollections.lensId})`, 0))
      .orderBy(asc(collections.name));
    allCollections = rows;
  } catch {
    // DB not connected
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Collections
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Curated thematic lists of lenses based on features, use cases, and
            historical significance.
          </p>
        </div>

        {allCollections.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.slug}`}
                className="rounded-lg border border-zinc-200 p-4 transition-all duration-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {collection.name}
                </h2>
                {collection.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {collection.description}
                  </p>
                )}
                <div className="mt-3">
                  <Badge variant="secondary">
                    {collection.lensCount} {collection.lensCount === 1 ? "lens" : "lenses"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-zinc-500">No collections yet.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
