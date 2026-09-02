import { unstable_cache } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses, lensSystems } from "@/db/schema";

export type FittingLens = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  weightG: number | null;
  yearIntroduced: number | null;
  isZoom: boolean | null;
  isMacro: boolean | null;
  hasAutofocus: boolean | null;
};

/**
 * Every lens made for a body's mount, ordered by focal length so the list
 * reads as a catalogue rather than an alphabetical jumble.
 *
 * "Which lenses fit my camera" is the most common question in the research and
 * the site could not answer it: lens_compatibility holds no rows, so native
 * fit is derived from the mount the two share.
 */
export const getLensesForMount = unstable_cache(
  async (systemId: number | null): Promise<FittingLens[]> => {
    if (!systemId) return [];

    return db
      .select({
        id: lenses.id,
        name: lenses.name,
        slug: lenses.slug,
        brand: lenses.brand,
        focalLengthMin: lenses.focalLengthMin,
        focalLengthMax: lenses.focalLengthMax,
        apertureMin: lenses.apertureMin,
        weightG: lenses.weightG,
        yearIntroduced: lenses.yearIntroduced,
        isZoom: lenses.isZoom,
        isMacro: lenses.isMacro,
        hasAutofocus: lenses.hasAutofocus,
      })
      .from(lensSystems)
      .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
      .where(and(eq(lensSystems.systemId, systemId), isNull(lenses.mergedIntoId)))
      .orderBy(asc(lenses.focalLengthMin), asc(lenses.apertureMin), asc(lenses.name))
      .limit(1000);
  },
  ["lenses-for-mount"],
  { revalidate: 2592000, tags: ["lenses", "cameras"] },
);

/** Slugs for the sitemap: every camera that has a mount worth listing. */
export const getCamerasWithMounts = unstable_cache(
  async (): Promise<{ slug: string }[]> => {
    const rows = await db
      .select({ slug: sql<string>`c.slug` })
      .from(sql`cameras c`)
      .where(sql`c.merged_into_id is null and c.system_id is not null`);
    return rows;
  },
  ["cameras-with-mounts"],
  { revalidate: 604800, tags: ["cameras"] },
);
