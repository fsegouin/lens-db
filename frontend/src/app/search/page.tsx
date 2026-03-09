import Link from "next/link";
import { and, or } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, systems } from "@/db/schema";
import SearchInput from "@/components/SearchInput";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { buildNameSearch } from "@/lib/search";

export const metadata = {
  title: "Search | Lens DB",
  description: "Search across all lenses, cameras, and systems.",
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
      const lensWhere = buildNameSearch(lenses.name, query);
      const cameraNameWhere = buildNameSearch(cameras.name, query);
      const cameraAliasWhere = buildNameSearch(cameras.alias, query);
      const systemNameWhere = buildNameSearch(systems.name, query);
      const systemMfrWhere = buildNameSearch(systems.manufacturer, query);

      [lensResults, cameraResults, systemResults] = await Promise.all([
        lensWhere.length > 0
          ? db.select().from(lenses).where(and(...lensWhere)).limit(20)
          : [],
        cameraNameWhere.length > 0 || cameraAliasWhere.length > 0
          ? db
              .select()
              .from(cameras)
              .where(
                or(
                  cameraNameWhere.length > 0 ? and(...cameraNameWhere) : undefined,
                  cameraAliasWhere.length > 0 ? and(...cameraAliasWhere) : undefined
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
    } catch {
      // DB not connected
    }
  }

  const hasResults = lensResults.length > 0 || cameraResults.length > 0 || systemResults.length > 0;

  return (
    <PageTransition>
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
    </PageTransition>
  );
}
