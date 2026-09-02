import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { escapeLikeMetachars } from "../search";

const { cameras, systems } = schema;

export const getCameraDetailsSchema = z.object({
  slug: z.string().describe("Camera slug or name, e.g. 'nikon-f3-1980' or 'Nikon F3'"),
});

export type GetCameraDetailsParams = z.infer<typeof getCameraDetailsSchema>;

const CAMERA_FIELDS = {
  name: cameras.name,
  slug: cameras.slug,
  system: systems.name,
  description: cameras.description,
  alias: cameras.alias,
  sensorType: cameras.sensorType,
  sensorSize: cameras.sensorSize,
  megapixels: cameras.megapixels,
  resolution: cameras.resolution,
  yearIntroduced: cameras.yearIntroduced,
  bodyType: cameras.bodyType,
  weightG: cameras.weightG,
  specs: cameras.specs,
  averageRating: cameras.averageRating,
  ratingCount: cameras.ratingCount,
} as const;

export async function getCameraDetails(params: GetCameraDetailsParams) {
  const db = getDb();

  // Slugs used to carry a "camera/" prefix (migration 0023 removed it), and
  // callers still hold the old form.
  const slug = params.slug.replace(/^camera\//, "");

  // Try exact slug match first
  const [exact] = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(and(eq(cameras.slug, slug), isNull(cameras.mergedIntoId)))
    .limit(1);

  if (exact) return exact;

  // Fallback: fuzzy match on slug or name, prefer shortest slug (most likely the base model)
  const fuzzyPattern = `%${escapeLikeMetachars(slug)}%`;
  const [fuzzy] = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(
      and(
        sql`(${cameras.slug} ILIKE ${fuzzyPattern} OR ${cameras.name} ILIKE ${fuzzyPattern})`,
        isNull(cameras.mergedIntoId)
      )
    )
    .orderBy(sql`length(${cameras.slug})`)
    .limit(1);

  if (fuzzy) return fuzzy;

  return { error: `Camera not found: ${params.slug}` };
}
