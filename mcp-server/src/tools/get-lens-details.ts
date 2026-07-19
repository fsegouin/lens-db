import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { escapeLikeMetachars } from "../search";

const { lenses, systems } = schema;

export const getLensDetailsSchema = z.object({
  slug: z.string().describe("Lens slug or name, e.g. 'canon-ef-50mm-f-1-4-usm' or 'Canon EF 50mm f/1.4 USM'"),
});

export type GetLensDetailsParams = z.infer<typeof getLensDetailsSchema>;

const LENS_FIELDS = {
  name: lenses.name,
  slug: lenses.slug,
  brand: lenses.brand,
  system: systems.name,
  description: lenses.description,
  lensType: lenses.lensType,
  era: lenses.era,
  productionStatus: lenses.productionStatus,
  focalLengthMin: lenses.focalLengthMin,
  focalLengthMax: lenses.focalLengthMax,
  apertureMin: lenses.apertureMin,
  apertureMax: lenses.apertureMax,
  weightG: lenses.weightG,
  filterSizeMm: lenses.filterSizeMm,
  minFocusDistanceM: lenses.minFocusDistanceM,
  maxMagnification: lenses.maxMagnification,
  lensElements: lenses.lensElements,
  lensGroups: lenses.lensGroups,
  diaphragmBlades: lenses.diaphragmBlades,
  yearIntroduced: lenses.yearIntroduced,
  yearDiscontinued: lenses.yearDiscontinued,
  isZoom: lenses.isZoom,
  isPrime: lenses.isPrime,
  isMacro: lenses.isMacro,
  hasAutofocus: lenses.hasAutofocus,
  hasStabilization: lenses.hasStabilization,
  specs: lenses.specs,
  averageRating: lenses.averageRating,
  ratingCount: lenses.ratingCount,
} as const;

export async function getLensDetails(params: GetLensDetailsParams) {
  const db = getDb();

  // Try exact slug match first
  const [exact] = await db
    .select(LENS_FIELDS)
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(and(eq(lenses.slug, params.slug), isNull(lenses.mergedIntoId)))
    .limit(1);

  if (exact) return exact;

  // Fallback: fuzzy match on slug or name, prefer shortest slug (most likely the base model)
  const fuzzyPattern = '%' + escapeLikeMetachars(params.slug) + '%';
  const [fuzzy] = await db
    .select(LENS_FIELDS)
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(
      and(
        sql`(${lenses.slug} ILIKE ${fuzzyPattern} OR ${lenses.name} ILIKE ${fuzzyPattern})`,
        isNull(lenses.mergedIntoId)
      )
    )
    .orderBy(sql`length(${lenses.slug})`)
    .limit(1);

  if (fuzzy) return fuzzy;

  return { error: `Lens not found: ${params.slug}` };
}
