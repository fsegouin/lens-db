import { z } from "zod";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../db";
import { buildSearchPatterns } from "../search";

const { lenses, systems, priceEstimates } = schema;

export const searchLensesSchema = z.object({
  query: z.string().optional().describe("Free text search on lens name"),
  system: z.string().optional().describe("Mount system name, e.g. 'Nikon F', 'Sony E'"),
  brand: z.string().optional().describe("Lens manufacturer"),
  focalLengthMin: z.number().optional().describe("Minimum focal length in mm"),
  focalLengthMax: z.number().optional().describe("Maximum focal length in mm"),
  apertureMax: z.number().optional().describe("Maximum aperture (e.g. 1.4, 2.8)"),
  isZoom: z.boolean().optional().describe("Filter for zoom lenses"),
  isPrime: z.boolean().optional().describe("Filter for prime lenses"),
  isMacro: z.boolean().optional().describe("Filter for macro lenses"),
  hasAutofocus: z.boolean().optional().describe("Filter for autofocus lenses"),
  hasStabilization: z.boolean().optional().describe("Filter for stabilized lenses"),
  coverage: z.enum(["full-frame", "aps-c", "micro-four-thirds", "medium-format"]).optional().describe("Image circle coverage"),
  yearFrom: z.number().optional().describe("Earliest year introduced"),
  yearTo: z.number().optional().describe("Latest year introduced"),
  priceMin: z.number().optional().describe("Minimum second-hand median price in USD"),
  priceMax: z.number().optional().describe("Maximum second-hand median price in USD"),
  limit: z.number().min(1).max(100).default(50).describe("Max results to return"),
});

export type SearchLensesParams = z.infer<typeof searchLensesSchema>;

export async function searchLenses(params: SearchLensesParams) {
  const db = getDb();
  const conditions = [];

  if (params.query) {
    for (const pattern of buildSearchPatterns(params.query)) {
      conditions.push(
        sql`regexp_replace(${lenses.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
    }
  }
  if (params.system) {
    conditions.push(sql`${systems.name} ILIKE ${params.system}`);
  }
  if (params.brand) {
    conditions.push(sql`${lenses.brand} ILIKE ${params.brand}`);
  }
  if (params.focalLengthMin) {
    conditions.push(gte(lenses.focalLengthMin, params.focalLengthMin));
  }
  if (params.focalLengthMax) {
    conditions.push(lte(lenses.focalLengthMax, params.focalLengthMax));
  }
  if (params.apertureMax) {
    conditions.push(lte(lenses.apertureMin, params.apertureMax));
  }
  if (params.isZoom !== undefined) {
    conditions.push(eq(lenses.isZoom, params.isZoom));
  }
  if (params.isPrime !== undefined) {
    conditions.push(eq(lenses.isPrime, params.isPrime));
  }
  if (params.isMacro !== undefined) {
    conditions.push(eq(lenses.isMacro, params.isMacro));
  }
  if (params.hasAutofocus !== undefined) {
    conditions.push(eq(lenses.hasAutofocus, params.hasAutofocus));
  }
  if (params.hasStabilization !== undefined) {
    conditions.push(eq(lenses.hasStabilization, params.hasStabilization));
  }
  if (params.coverage) {
    conditions.push(eq(lenses.coverage, params.coverage));
  }
  if (params.yearFrom) {
    conditions.push(gte(lenses.yearIntroduced, params.yearFrom));
  }
  if (params.yearTo) {
    conditions.push(lte(lenses.yearIntroduced, params.yearTo));
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
      name: lenses.name,
      slug: lenses.slug,
      brand: lenses.brand,
      system: systems.name,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      apertureMax: lenses.apertureMax,
      yearIntroduced: lenses.yearIntroduced,
      isZoom: lenses.isZoom,
      isPrime: lenses.isPrime,
      isMacro: lenses.isMacro,
      hasAutofocus: lenses.hasAutofocus,
      hasStabilization: lenses.hasStabilization,
      weightG: lenses.weightG,
      medianPrice: priceEstimates.medianPrice,
    })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .leftJoin(
      priceEstimates,
      and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id)
      )
    )
    .where(where)
    .orderBy(asc(lenses.name))
    .limit(params.limit + 1);

  const hasMore = results.length > params.limit;
  const trimmed = hasMore ? results.slice(0, params.limit) : results;

  return {
    returned: trimmed.length,
    hasMore,
    lenses: trimmed,
    ...(hasMore && {
      note: `More results available. Narrow your search with more specific filters.`,
    }),
  };
}
