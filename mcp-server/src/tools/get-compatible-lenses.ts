import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "../db";

const { cameras, lenses, lensCompatibility, systems } = schema;

export const getCompatibleLensesSchema = z.object({
  cameraSlug: z.string().describe("Camera slug"),
  limit: z.number().min(1).max(100).default(50).describe("Max results to return"),
});

export type GetCompatibleLensesParams = z.infer<typeof getCompatibleLensesSchema>;

export async function getCompatibleLenses(params: GetCompatibleLensesParams) {
  const db = getDb();

  const [camera] = await db
    .select({ id: cameras.id, name: cameras.name })
    .from(cameras)
    .where(eq(cameras.slug, params.cameraSlug))
    .limit(1);

  if (!camera) {
    return { error: `Camera not found with slug: ${params.cameraSlug}` };
  }

  const results = await db
    .select({
      name: lenses.name,
      slug: lenses.slug,
      brand: lenses.brand,
      system: systems.name,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      isNative: lensCompatibility.isNative,
      notes: lensCompatibility.notes,
    })
    .from(lensCompatibility)
    .innerJoin(lenses, eq(lensCompatibility.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensCompatibility.cameraId, camera.id))
    .orderBy(asc(lenses.name))
    .limit(params.limit + 1);

  const hasMore = results.length > params.limit;
  const trimmed = hasMore ? results.slice(0, params.limit) : results;

  return {
    camera: camera.name,
    count: trimmed.length,
    hasMore,
    lenses: trimmed,
  };
}
