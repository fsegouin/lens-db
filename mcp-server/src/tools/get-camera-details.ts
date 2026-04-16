import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";

const { cameras, systems } = schema;

export const getCameraDetailsSchema = z.object({
  slug: z.string().describe("Camera slug or name, e.g. 'camera/nikon-f3-1980' or 'Nikon F3'"),
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

  // Try exact slug match first
  const [exact] = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, params.slug))
    .limit(1);

  if (exact) return exact;

  // Fallback: fuzzy match on slug or name
  const [fuzzy] = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(
      sql`${cameras.slug} ILIKE ${'%' + params.slug + '%'} OR ${cameras.name} ILIKE ${'%' + params.slug + '%'}`
    )
    .limit(1);

  if (fuzzy) return fuzzy;

  return { error: `Camera not found: ${params.slug}` };
}
