import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensSeries } from "@/db/schema";
import { buildNameMatchers, matchesNormalizedName } from "@/lib/search";

type ResultRow = {
  id: number;
  name: string;
  slug: string;
  type: "lens" | "camera" | "system" | "collection" | "series";
};

const MAX_PER_TYPE = 5;

// Names and slugs of every searchable entity, refreshed hourly. Searching
// this in-process replaces one DB round-trip per search request with one
// per hour.
const getSearchIndex = unstable_cache(
  async () => {
    const [lensRows, cameraRows, systemRows, collectionRows, seriesRows] = await Promise.all([
      db
        .select({ id: lenses.id, name: lenses.name, slug: lenses.slug })
        .from(lenses)
        .where(isNull(lenses.mergedIntoId)),
      db
        .select({ id: cameras.id, name: cameras.name, slug: cameras.slug, alias: cameras.alias })
        .from(cameras)
        .where(isNull(cameras.mergedIntoId)),
      db
        .select({ id: systems.id, name: systems.name, slug: systems.slug, manufacturer: systems.manufacturer })
        .from(systems),
      db
        .select({ id: collections.id, name: collections.name, slug: collections.slug })
        .from(collections),
      // Series are the home of manufacturer product lines, so a search for
      // "Canon L" has to reach them the way it used to reach the collection.
      db
        .select({ id: lensSeries.id, name: lensSeries.name, slug: lensSeries.slug })
        .from(lensSeries),
    ]);
    return {
      lenses: lensRows,
      cameras: cameraRows,
      systems: systemRows,
      collections: collectionRows,
      series: seriesRows,
    };
  },
  ["search-index"],
  { revalidate: 3600, tags: ["lenses", "cameras"] }
);

function pick<T extends { id: number; name: string; slug: string }>(
  rows: T[],
  type: ResultRow["type"],
  matches: (row: T) => boolean,
): ResultRow[] {
  const out: ResultRow[] = [];
  for (const row of rows) {
    if (!matches(row)) continue;
    out.push({ id: row.id, name: row.name, slug: row.slug, type });
    if (out.length === MAX_PER_TYPE) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200);
  if (!q || q.length < 2) {
    return NextResponse.json({ lenses: [], cameras: [], systems: [], collections: [], series: [] });
  }

  const matchers = buildNameMatchers(q);
  if (matchers.length === 0) {
    return NextResponse.json({ lenses: [], cameras: [], systems: [], collections: [], series: [] });
  }

  const index = await getSearchIndex();

  return NextResponse.json({
    lenses: pick(index.lenses, "lens", (r) =>
      matchesNormalizedName(r.name, matchers)
    ),
    cameras: pick(index.cameras, "camera", (r) =>
      matchesNormalizedName(r.name, matchers) ||
      matchesNormalizedName(r.alias, matchers)
    ),
    systems: pick(index.systems, "system", (r) =>
      matchesNormalizedName(r.name, matchers) ||
      matchesNormalizedName(r.manufacturer, matchers)
    ),
    collections: pick(index.collections, "collection", (r) =>
      matchesNormalizedName(r.name, matchers)
    ),
    series: pick(index.series, "series", (r) =>
      matchesNormalizedName(r.name, matchers)
    ),
  });
}
