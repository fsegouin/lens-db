import { unstable_cache } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses, lensSystems } from "@/db/schema";

export type CameraRelations = {
  lenses: {
    name: string;
    slug: string;
    focalLengthMin: number | null;
    focalLengthMax: number | null;
    apertureMin: number | null;
  }[];
  lensCount: number;
};

/**
 * The lenses that mount natively on a body. Answers "what fits my camera",
 * which the camera page previously could not answer at all.
 */
export const getCameraRelations = unstable_cache(
  async (systemId: number | null): Promise<CameraRelations> => {
    if (!systemId) return { lenses: [], lensCount: 0 };

    const [lensRows, countRows] = await Promise.all([
      db
        .select({
          name: lenses.name,
          slug: lenses.slug,
          focalLengthMin: lenses.focalLengthMin,
          focalLengthMax: lenses.focalLengthMax,
          apertureMin: lenses.apertureMin,
        })
        .from(lensSystems)
        .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
        .where(and(eq(lensSystems.systemId, systemId), isNull(lenses.mergedIntoId)))
        .orderBy(asc(lenses.focalLengthMin), asc(lenses.name))
        .limit(12),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(lensSystems)
        .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
        .where(and(eq(lensSystems.systemId, systemId), isNull(lenses.mergedIntoId))),
    ]);

    return { lenses: lensRows, lensCount: countRows[0]?.count ?? 0 };
  },
  ["camera-relations"],
  { revalidate: 2592000, tags: ["lenses", "cameras"] },
);
