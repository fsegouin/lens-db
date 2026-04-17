import { z } from "zod";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../db";

const { cameras, systems, priceEstimates } = schema;

export const searchCamerasSchema = z.object({
  query: z.string().optional().describe("Free text search on camera name"),
  system: z.string().optional().describe("Mount system name, e.g. 'Nikon F', 'Canon EF'"),
  brand: z.string().optional().describe("Camera manufacturer/brand name prefix, e.g. 'Nikon', 'Canon'. Filters cameras whose name starts with this value."),
  yearFrom: z.number().optional().describe("Earliest year introduced"),
  yearTo: z.number().optional().describe("Latest year introduced"),
  sensorSize: z.string().optional().describe("Sensor size, e.g. 'Full Frame', 'APS-C'"),
  sensorType: z.string().optional().describe("Sensor type, e.g. 'CMOS', 'CCD', 'Film'. Use 'Film' to restrict to film cameras, or a digital sensor type to exclude them."),
  bodyType: z.string().optional().describe("Body type, e.g. 'SLR', 'Mirrorless', 'Rangefinder'"),
  filmType: z.string().optional().describe("Film format for film cameras, e.g. '35mm', '120', 'Medium format'. Filters cameras whose specs 'Film type' matches exactly."),
  priceMin: z.number().optional().describe("Minimum second-hand median price in USD"),
  priceMax: z.number().optional().describe("Maximum second-hand median price in USD"),
  limit: z.number().min(1).max(100).default(50).describe("Max results to return"),
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
      sql`${cameras.name} ILIKE ${params.brand + '%'}`
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
  if (params.sensorType) {
    conditions.push(eq(cameras.sensorType, params.sensorType));
  }
  if (params.bodyType) {
    conditions.push(eq(cameras.bodyType, params.bodyType));
  }
  if (params.filmType) {
    conditions.push(sql`${cameras.specs}->>'Film type' = ${params.filmType}`);
  }
  if (params.priceMin !== undefined) {
    conditions.push(gte(priceEstimates.medianPrice, params.priceMin));
  }
  if (params.priceMax !== undefined) {
    conditions.push(lte(priceEstimates.medianPrice, params.priceMax));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch limit+1 to detect if there are more results without a separate COUNT query
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
    .limit(params.limit + 1);

  const hasMore = results.length > params.limit;
  const trimmed = hasMore ? results.slice(0, params.limit) : results;

  return {
    returned: trimmed.length,
    hasMore,
    cameras: trimmed,
    ...(hasMore && {
      note: `More results available. Use the 'query' or 'brand' parameter to narrow your search.`,
    }),
  };
}
