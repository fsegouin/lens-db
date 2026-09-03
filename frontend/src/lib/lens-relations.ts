import { unstable_cache } from "next/cache";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cameras,
  collections,
  lenses,
  lensCollections,
  lensSeries,
  lensSeriesMemberships,
  lensSystems,
  systems,
} from "@/db/schema";

export type LensRelations = {
  /** Every mount the lens is sold in, primary first. */
  mounts: { id: number; name: string; slug: string }[];
  series: { name: string; slug: string }[];
  collections: { name: string; slug: string }[];
  /** Bodies that take one of those mounts natively. */
  cameras: { name: string; slug: string; yearIntroduced: number | null }[];
  cameraCount: number;
  /**
   * Bodies this lens is built into and cannot be removed from. A fixed-lens
   * camera has no mount, so it can never appear in `cameras` above, and
   * without this the lens page is a dead end back to its own camera.
   */
  builtInto: { name: string; slug: string; yearIntroduced: number | null }[];
  /** Other lenses in the same version group. */
  versions: {
    id: number;
    name: string;
    slug: string;
    versionLabel: string | null;
    yearIntroduced: number | null;
    weightG: number | null;
  }[];
};

/**
 * Everything the lens page links out to. One cached call instead of the
 * per-request queries the page used to run, so a crawl of 9,500 lens pages
 * costs one query set per lens per revalidation window.
 */
export const getLensRelations = unstable_cache(
  async (
    lensId: number,
    primarySystemId: number | null,
    versionGroupId: number | null,
  ): Promise<LensRelations> => {
    const mountRows = await db
      .select({ id: systems.id, name: systems.name, slug: systems.slug })
      .from(lensSystems)
      .innerJoin(systems, eq(lensSystems.systemId, systems.id))
      .where(eq(lensSystems.lensId, lensId));

    // Primary mount first; the rest alphabetically, so badge order is stable.
    const mounts = [
      ...mountRows.filter((m) => m.id === primarySystemId),
      ...mountRows
        .filter((m) => m.id !== primarySystemId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];
    const systemIds = mounts.map((m) => m.id);

    const [
      seriesRows,
      collectionRows,
      cameraRows,
      cameraCountRows,
      versionRows,
      builtIntoRows,
    ] = await Promise.all([
        db
          .select({ name: lensSeries.name, slug: lensSeries.slug })
          .from(lensSeriesMemberships)
          .innerJoin(lensSeries, eq(lensSeriesMemberships.seriesId, lensSeries.id))
          .where(eq(lensSeriesMemberships.lensId, lensId)),
        db
          .select({ name: collections.name, slug: collections.slug })
          .from(lensCollections)
          .innerJoin(collections, eq(lensCollections.collectionId, collections.id))
          .where(eq(lensCollections.lensId, lensId)),
        systemIds.length > 0
          ? db
              .select({
                name: cameras.name,
                slug: cameras.slug,
                yearIntroduced: cameras.yearIntroduced,
              })
              .from(cameras)
              .where(
                and(
                  inArray(cameras.systemId, systemIds),
                  isNull(cameras.mergedIntoId),
                ),
              )
              .orderBy(desc(cameras.yearIntroduced))
              .limit(12)
          : Promise.resolve([]),
        systemIds.length > 0
          ? db
              .select({ count: sql<number>`count(*)::int` })
              .from(cameras)
              .where(
                and(
                  inArray(cameras.systemId, systemIds),
                  isNull(cameras.mergedIntoId),
                ),
              )
          : Promise.resolve([{ count: 0 }]),
        versionGroupId
          ? db
              .select({
                id: lenses.id,
                name: lenses.name,
                slug: lenses.slug,
                versionLabel: lenses.versionLabel,
                yearIntroduced: lenses.yearIntroduced,
                weightG: lenses.weightG,
              })
              .from(lenses)
              .where(
                and(
                  eq(lenses.versionGroupId, versionGroupId),
                  ne(lenses.id, lensId),
                  isNull(lenses.mergedIntoId),
                ),
              )
              .orderBy(lenses.yearIntroduced)
          : Promise.resolve([]),
        db
          .select({
            name: cameras.name,
            slug: cameras.slug,
            yearIntroduced: cameras.yearIntroduced,
          })
          .from(cameras)
          .where(
            and(eq(cameras.builtInLensId, lensId), isNull(cameras.mergedIntoId)),
          )
          .orderBy(cameras.name),
      ]);

    return {
      mounts,
      series: seriesRows,
      collections: collectionRows,
      cameras: cameraRows,
      cameraCount: cameraCountRows[0]?.count ?? 0,
      builtInto: builtIntoRows,
      versions: versionRows,
    };
  },
  ["lens-relations"],
  { revalidate: 2592000, tags: ["lenses", "cameras"] },
);
