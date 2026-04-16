import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";

const { lenses, systems } = schema;

export const getLensDetailsSchema = z.object({
  slug: z.string().describe("Lens slug, e.g. 'canon-ef-50mm-f-1-4-usm'"),
});

export type GetLensDetailsParams = z.infer<typeof getLensDetailsSchema>;

export async function getLensDetails(params: GetLensDetailsParams) {
  const db = getDb();

  const [result] = await db
    .select({
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
    })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lenses.slug, params.slug))
    .limit(1);

  if (!result) {
    return { error: `Lens not found with slug: ${params.slug}` };
  }

  return result;
}
