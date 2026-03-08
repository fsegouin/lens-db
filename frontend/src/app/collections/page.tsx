import Link from "next/link";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { asc } from "drizzle-orm";

export const metadata = {
  title: "Collections | Lens DB",
  description: "Curated thematic lens collections.",
};

export default async function CollectionsPage() {
  let allCollections: (typeof collections.$inferSelect)[] = [];

  try {
    allCollections = await db
      .select()
      .from(collections)
      .orderBy(asc(collections.name));
  } catch {
    // DB not connected
  }

  return (
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
              className="rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {collection.name}
              </h2>
              {collection.description && (
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {collection.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No collections yet. Collections will be populated from scraped data.
          </p>
          <div className="mt-4 text-sm text-zinc-400">
            <p>Expected collections include:</p>
            <ul className="mt-2 space-y-1">
              <li>Holy Trinities</li>
              <li>Ultra-fast Lenses</li>
              <li>Pancake Lenses</li>
              <li>Mirror/Reflex Lenses</li>
              <li>Macro Lenses (1:1)</li>
              <li>Soft Focus Lenses</li>
              <li>Historically Significant Lenses</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
