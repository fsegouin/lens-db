import { unstable_cache } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cameras,
  lensCollections,
  lenses,
  lensSeriesMemberships,
  lensSystems,
  systems,
} from "@/db/schema";

/**
 * The lens tables on the system, collection and series pages.
 *
 * These used to select the whole lens row, description and specs JSON
 * included, for up to 500 lenses per render, straight from the page with no
 * data cache in front. A hub page render therefore cost about 150 KB of
 * database egress, and with the route cache emptied on every deploy the
 * hub pages alone accounted for most of a month's Supabase egress quota
 * in a week. Each list here selects only the columns its table shows and
 * is cached for a week under the "lenses" tag, like the other lens lists.
 */

/** Exactly the columns the hub tables render. */
const lensRowColumns = {
  id: lenses.id,
  name: lenses.name,
  slug: lenses.slug,
  brand: lenses.brand,
  focalLengthMin: lenses.focalLengthMin,
  focalLengthMax: lenses.focalLengthMax,
  apertureMin: lenses.apertureMin,
  yearIntroduced: lenses.yearIntroduced,
  isZoom: lenses.isZoom,
  isPrime: lenses.isPrime,
  isMacro: lenses.isMacro,
};

export type HubLensRow = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  yearIntroduced: number | null;
  isZoom: boolean | null;
  isPrime: boolean | null;
  isMacro: boolean | null;
};

export type HubLensWithSystem = { lens: HubLensRow; system: { name: string } | null };

export type HubCameraRow = {
  id: number;
  name: string;
  slug: string;
  yearIntroduced: number | null;
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
};

/** Family name first ("Nikkor", "Summicron"), then focal length, then speed. */
const familyOrder = () => [
  asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`),
  asc(lenses.focalLengthMin),
  asc(lenses.apertureMin),
];

const withSystem = (rows: (HubLensRow & { systemName: string | null })[]): HubLensWithSystem[] =>
  rows.map(({ systemName, ...lens }) => ({
    lens,
    system: systemName ? { name: systemName } : null,
  }));

/**
 * Every lens sold in a mount (lens_systems), not only those whose primary
 * mount it is. Live rows only: a merged-away lens keeps its membership row.
 */
export const getSystemLenses = unstable_cache(
  async (systemId: number): Promise<HubLensRow[]> =>
    db
      .select(lensRowColumns)
      .from(lensSystems)
      .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
      .where(and(eq(lensSystems.systemId, systemId), isNull(lenses.mergedIntoId)))
      .orderBy(...familyOrder())
      .limit(500),
  ["system-lenses"],
  { revalidate: 604800, tags: ["lenses"] },
);

export const getSystemCameras = unstable_cache(
  async (systemId: number): Promise<HubCameraRow[]> =>
    db
      .select({
        id: cameras.id,
        name: cameras.name,
        slug: cameras.slug,
        yearIntroduced: cameras.yearIntroduced,
        sensorType: cameras.sensorType,
        sensorSize: cameras.sensorSize,
        megapixels: cameras.megapixels,
      })
      .from(cameras)
      .where(and(eq(cameras.systemId, systemId), isNull(cameras.mergedIntoId)))
      .orderBy(asc(cameras.name))
      .limit(500),
  ["system-cameras"],
  { revalidate: 604800, tags: ["cameras"] },
);

/**
 * Merged-away lenses keep their membership rows, so without the filter the
 * page lists the same lens twice and the loser's slug no longer resolves.
 */
export const getCollectionLenses = unstable_cache(
  async (collectionId: number): Promise<HubLensWithSystem[]> =>
    db
      .select({ ...lensRowColumns, systemName: systems.name })
      .from(lensCollections)
      .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(and(eq(lensCollections.collectionId, collectionId), isNull(lenses.mergedIntoId)))
      .orderBy(...familyOrder())
      .then(withSystem),
  ["collection-lenses"],
  { revalidate: 604800, tags: ["lenses"] },
);

export const getSeriesLenses = unstable_cache(
  async (seriesId: number): Promise<HubLensWithSystem[]> =>
    db
      .select({ ...lensRowColumns, systemName: systems.name })
      .from(lensSeriesMemberships)
      .innerJoin(lenses, eq(lensSeriesMemberships.lensId, lenses.id))
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(and(eq(lensSeriesMemberships.seriesId, seriesId), isNull(lenses.mergedIntoId)))
      .orderBy(...familyOrder())
      .then(withSystem),
  ["series-lenses"],
  { revalidate: 604800, tags: ["lenses"] },
);
