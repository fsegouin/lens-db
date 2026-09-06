import Link from "next/link";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { collections, lensCollections, lenses } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { cleanScrapedDescription } from "@/lib/scraped-description";

export const revalidate = 604800;

export const metadata = {
  title: "Collections",
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
        // Counted over joined lens rows, not raw membership rows, so this
        // agrees with the detail page. Membership rows pointing at a deleted
        // or merged-away lens drop out of both.
        lensCount: sql<number>`count(${lenses.id})::integer`,
      })
      .from(collections)
      .leftJoin(lensCollections, eq(collections.id, lensCollections.collectionId))
      .leftJoin(lenses, and(eq(lensCollections.lensId, lenses.id), isNull(lenses.mergedIntoId)))
      .groupBy(collections.id)
      .having(gt(sql`count(${lenses.id})`, 0))
      .orderBy(asc(collections.name));
    allCollections = rows;
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Collections
        </h1>
        <p className="mt-2 text-muted-foreground">
          Curated thematic lists of lenses based on features, use cases, and
          historical significance.
        </p>
      </div>

      {allCollections.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allCollections.map((collection) => {
            const description = cleanScrapedDescription(collection.description);
            return (
              <Link
                key={collection.id}
                href={`/collections/${collection.slug}`}
                /*
                 * min-w-0: a grid item defaults to min-width:auto, so one card
                 * whose text cannot wrap sizes the shared column for every
                 * card. A scraped description carrying table headings did
                 * exactly that and pushed the page 149px wider than the phone.
                 */
                className="min-w-0 rounded-lg border border-zinc-200 p-4 transition-all duration-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold break-words text-zinc-900 dark:text-zinc-100">
                  {collection.name}
                </h2>
                {description && (
                  <p className="mt-2 line-clamp-2 text-sm break-words text-muted-foreground">
                    {description}
                  </p>
                )}
                <div className="mt-3">
                  <Badge variant="secondary">
                    {collection.lensCount}{" "}
                    {collection.lensCount === 1 ? "lens" : "lenses"}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-muted-foreground">No collections yet.</p>
        </div>
      )}
    </div>
  );
}
