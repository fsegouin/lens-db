import { unstable_cache } from "next/cache";
import { and, desc, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses } from "@/db/schema";

export type NewEntity = {
  type: "lens" | "camera";
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  yearIntroduced: number | null;
  /** ISO string: the cache serialises Dates on the way back out. */
  createdAt: string;
  href: string;
};

export const SITE_URL = "https://thelensdb.com";

/**
 * Lenses and bodies added to the database recently.
 *
 * The home page shows the last ten lenses; this is the same question asked
 * across both tables and over a longer window, for the /new page, the RSS feed
 * and the weekly digest. A bulk import can add hundreds of rows in a day, so
 * the caller's limit is a hard cap rather than a suggestion.
 */
async function queryNewEntities(since: Date | null, limit: number): Promise<NewEntity[]> {
  const lensWhere = [isNull(lenses.mergedIntoId), sql`${lenses.createdAt} is not null`];
  const cameraWhere = [isNull(cameras.mergedIntoId), sql`${cameras.createdAt} is not null`];
  if (since) {
    lensWhere.push(gt(lenses.createdAt, since));
    cameraWhere.push(gt(cameras.createdAt, since));
  }

  const [lensRows, cameraRows] = await Promise.all([
    db
      .select({
        id: lenses.id,
        name: lenses.name,
        slug: lenses.slug,
        brand: lenses.brand,
        yearIntroduced: lenses.yearIntroduced,
        createdAt: lenses.createdAt,
      })
      .from(lenses)
      .where(and(...lensWhere))
      .orderBy(desc(lenses.createdAt), desc(lenses.id))
      .limit(limit),
    db
      .select({
        id: cameras.id,
        name: cameras.name,
        slug: cameras.slug,
        yearIntroduced: cameras.yearIntroduced,
        createdAt: cameras.createdAt,
      })
      .from(cameras)
      .where(and(...cameraWhere))
      .orderBy(desc(cameras.createdAt), desc(cameras.id))
      .limit(limit),
  ]);

  const out: NewEntity[] = [
    ...lensRows.map((r) => ({
      type: "lens" as const,
      id: r.id,
      name: r.name,
      slug: r.slug,
      brand: r.brand,
      yearIntroduced: r.yearIntroduced,
      createdAt: (r.createdAt as Date).toISOString(),
      href: `/lenses/${r.slug}`,
    })),
    ...cameraRows.map((r) => ({
      type: "camera" as const,
      id: r.id,
      name: r.name,
      slug: r.slug,
      // A camera's name already starts with its maker, and the mount's
      // manufacturer is the wrong answer often enough (a Ricoh GXR module on
      // Leica M reads "Leica") that no brand beats a misleading one.
      brand: null,
      yearIntroduced: r.yearIntroduced,
      createdAt: (r.createdAt as Date).toISOString(),
      href: `/cameras/${r.slug}`,
    })),
  ];

  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
  return out.slice(0, limit);
}

/**
 * The /new page and the feed. A window of days rather than a flat row cap,
 * because one bulk import can fill any cap with a single day and hide every
 * day before it; the page folds the long days itself.
 */
export const getNewEntities = unstable_cache(
  async (days = 90, limit = 600): Promise<NewEntity[]> =>
    queryNewEntities(new Date(Date.now() - days * 24 * 60 * 60 * 1000), limit),
  ["new-entities"],
  { revalidate: 3600, tags: ["lenses", "cameras"] },
);

/**
 * The last seven days, for the digest. Not cached: it runs once a week from a
 * cron and a stale answer there would mean a wrong email.
 */
export async function getNewEntitiesSummary(days = 7, limit = 200): Promise<NewEntity[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return queryNewEntities(since, limit);
}

/** YYYY-MM-DD in UTC, the grouping key for the page. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function groupByDay(entries: NewEntity[]): { day: string; entries: NewEntity[] }[] {
  const groups = new Map<string, NewEntity[]>();
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return Array.from(groups, ([day, entries]) => ({ day, entries }));
}
