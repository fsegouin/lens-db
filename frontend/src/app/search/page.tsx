import Link from "next/link";
import { and, isNull, or } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { cameras, lenses, systems } from "@/db/schema";
import SearchInput from "@/components/SearchInput";
import { Badge } from "@/components/ui/badge";
import { buildNameSearch } from "@/lib/search";

// Cached per query string so repeated searches (and bot re-crawls of
// /search?q=... URLs) don't each hit Postgres.
const searchAll = unstable_cache(
  async (query: string) => {
    const lensWhere = buildNameSearch(lenses.name, query);
    const cameraNameWhere = buildNameSearch(cameras.name, query);
    const cameraAliasWhere = buildNameSearch(cameras.alias, query);
    const systemNameWhere = buildNameSearch(systems.name, query);
    const systemMfrWhere = buildNameSearch(systems.manufacturer, query);

    const [lensResults, cameraResults, systemResults] = await Promise.all([
      lensWhere.length > 0
        ? db.select().from(lenses).where(and(...lensWhere, isNull(lenses.mergedIntoId))).limit(20)
        : [],
      cameraNameWhere.length > 0 || cameraAliasWhere.length > 0
        ? db
            .select()
            .from(cameras)
            .where(
              and(
                or(
                  cameraNameWhere.length > 0 ? and(...cameraNameWhere) : undefined,
                  cameraAliasWhere.length > 0 ? and(...cameraAliasWhere) : undefined
                ),
                isNull(cameras.mergedIntoId)
              )
            )
            .limit(20)
        : [],
      systemNameWhere.length > 0 || systemMfrWhere.length > 0
        ? db
            .select()
            .from(systems)
            .where(
              or(
                systemNameWhere.length > 0 ? and(...systemNameWhere) : undefined,
                systemMfrWhere.length > 0 ? and(...systemMfrWhere) : undefined
              )
            )
            .limit(20)
        : [],
    ]);

    return { lensResults, cameraResults, systemResults };
  },
  ["search-page"],
  { revalidate: 3600, tags: ["lenses", "cameras"] }
);

export const metadata = {
  title: "Search",
  description: "Search across all lenses, cameras, and systems.",
  // A results page for an arbitrary query is not a page we want indexed;
  // the entity pages it links to are.
  robots: { index: false, follow: true },
};

type SearchParams = Promise<{
  q?: string;
}>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = params.q?.trim();

  let lensResults: (typeof lenses.$inferSelect)[] = [];
  let cameraResults: (typeof cameras.$inferSelect)[] = [];
  let systemResults: (typeof systems.$inferSelect)[] = [];

  if (query && query.length >= 2) {
    try {
      const results = await searchAll(query.slice(0, 200));
      lensResults = results.lensResults;
      cameraResults = results.cameraResults;
      systemResults = results.systemResults;
    } catch {
      // DB not connected
    }
  }

  const hasResults = lensResults.length > 0 || cameraResults.length > 0 || systemResults.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Search</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Search across all lenses, cameras, and systems.
        </p>
      </div>

      <SearchInput defaultValue={query} />

      {query && !hasResults && (
        <p className="text-center text-zinc-500">No results found for &ldquo;{query}&rdquo;</p>
      )}

      {systemResults.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Systems <Badge variant="secondary">{systemResults.length}</Badge>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {systemResults.map((system) => (
              <Link
                key={system.id}
                href={`/systems/${system.slug}`}
                className="rounded-lg border border-zinc-200 p-3 text-sm transition-all hover:shadow-sm dark:border-zinc-800"
              >
                {system.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {lensResults.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Lenses <Badge variant="secondary">{lensResults.length}</Badge>
          </h2>
          <div className="space-y-2">
            {lensResults.map((lens) => (
              <Link
                key={lens.id}
                href={`/lenses/${lens.slug}`}
                className="block rounded-lg border border-zinc-200 p-3 transition-all hover:shadow-sm dark:border-zinc-800"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{lens.name}</span>
                <span className="ml-3 text-sm text-zinc-500">
                  {lens.focalLengthMin &&
                    (lens.focalLengthMin === lens.focalLengthMax
                      ? `${lens.focalLengthMin}mm`
                      : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`)}
                  {lens.apertureMin && ` f/${lens.apertureMin}`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {cameraResults.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Cameras <Badge variant="secondary">{cameraResults.length}</Badge>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cameraResults.map((camera) => (
              <Link
                key={camera.id}
                href={`/cameras/${camera.slug}`}
                className="rounded-lg border border-zinc-200 p-3 text-sm transition-all hover:shadow-sm dark:border-zinc-800"
              >
                {camera.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!query && (
        <div className="space-y-4 text-center text-zinc-500">
          <p>Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "Canon EF 50mm",
              "Nikon Z",
              "Sony FE",
              "Sigma Art",
              "Tamron",
              "85mm f/1.4",
            ].map((suggestion) => (
              <Link key={suggestion} href={`/search?q=${encodeURIComponent(suggestion)}`}>
                <Badge variant="outline" className="cursor-pointer">
                  {suggestion}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
