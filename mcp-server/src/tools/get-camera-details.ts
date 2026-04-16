import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, systems } = schema;

export const getCameraDetailsSchema = z.object({
  slug: z.string().describe("Camera slug, e.g. 'nikon-f3'"),
});

export type GetCameraDetailsParams = z.infer<typeof getCameraDetailsSchema>;

export async function getCameraDetails(params: GetCameraDetailsParams) {
  const db = getDb();

  const [result] = await db
    .select({
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
    })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, params.slug))
    .limit(1);

  if (!result) {
    return { error: `Camera not found with slug: ${params.slug}` };
  }

  return result;
}
