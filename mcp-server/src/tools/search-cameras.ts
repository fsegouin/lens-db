import { z } from "zod";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, systems, priceEstimates } = schema;

export const searchCamerasSchema = z.object({
  query: z.string().optional().describe("Free text search on camera name"),
  system: z.string().optional().describe("Mount system name, e.g. 'Nikon F', 'Canon EF'"),
  brand: z.string().optional().describe("Manufacturer name"),
  yearFrom: z.number().optional().describe("Earliest year introduced"),
  yearTo: z.number().optional().describe("Latest year introduced"),
  sensorSize: z.string().optional().describe("Sensor size, e.g. 'Full Frame', 'APS-C'"),
  bodyType: z.string().optional().describe("Body type, e.g. 'SLR', 'Mirrorless', 'Rangefinder'"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
});

export type SearchCamerasParams = z.infer<typeof searchCamerasSchema>;

export async function searchCameras(params: SearchCamerasParams) {
  const db = getDb();
  const conditions = [];

  if (params.query) {
    const words = params.query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
      if (!clean) continue;
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const startsWithDigit = /^\d/.test(clean);
      const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
      conditions.push(
        sql`regexp_replace(${cameras.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
    }
  }
  if (params.system) {
    conditions.push(
      sql`${systems.name} ILIKE ${params.system}`
    );
  }
  if (params.brand) {
    conditions.push(
      sql`${cameras.specs}->>'Brand' ILIKE ${params.brand}`
    );
  }
  if (params.yearFrom) {
    conditions.push(gte(cameras.yearIntroduced, params.yearFrom));
  }
  if (params.yearTo) {
    conditions.push(lte(cameras.yearIntroduced, params.yearTo));
  }
  if (params.sensorSize) {
    conditions.push(eq(cameras.sensorSize, params.sensorSize));
  }
  if (params.bodyType) {
    conditions.push(eq(cameras.bodyType, params.bodyType));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      name: cameras.name,
      slug: cameras.slug,
      system: systems.name,
      yearIntroduced: cameras.yearIntroduced,
      sensorType: cameras.sensorType,
      sensorSize: cameras.sensorSize,
      megapixels: cameras.megapixels,
      bodyType: cameras.bodyType,
      weightG: cameras.weightG,
      medianPrice: priceEstimates.medianPrice,
    })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .leftJoin(
      priceEstimates,
      and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id)
      )
    )
    .where(where)
    .orderBy(asc(cameras.name))
    .limit(params.limit);

  return {
    count: results.length,
    cameras: results,
  };
}
