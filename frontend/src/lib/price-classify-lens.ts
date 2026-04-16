import { generateText, Output } from "ai";
import { z } from "zod";

export const ClassifiedLensListingSchema = z.object({
  listings: z.array(
    z.object({
      isRelevant: z.boolean().describe(
        "True only if: (1) this is the exact target lens model (correct focal length, aperture, brand, mount), (2) it's in working condition (not for parts/repair/broken/untested), (3) it's a single item (not a lot or bundle with camera body)",
      ),
      isLensOnly: z.boolean().describe(
        "True if the listing is for the lens only (no camera body bundled)",
      ),
      conditionGrade: z.enum(["excellent", "good", "fair", "skip"]).describe(
        "Be strict — most lenses are 'good'. excellent: ONLY mint/near-mint with zero caveats (10-20% of listings). good: the default for working lenses — clean optics, smooth focus and aperture. fair: cosmetic issues, minor dust, stiff focus, oil on blades. skip: fungus, mold, haze, scratches on elements, separation, cloudy/foggy optics, broken, parts, untested.",
      ),
      conditionNotes: z.string().describe(
        "Brief notes about condition from the listing title",
      ),
      effectivePrice: z.number().describe(
        "The actual sale price in USD (not including shipping)",
      ),
    }),
  ),
});

export type ClassifiedLensListing = z.infer<typeof ClassifiedLensListingSchema>["listings"][number];

const BATCH_SIZE = 20;

export async function classifyLensListings(
  lensName: string,
  listings: { title: string; price: number; date: string; condition?: string; description?: string; url?: string }[],
): Promise<ClassifiedLensListing[]> {
  const allClassified: ClassifiedLensListing[] = [];

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    const listingLines = batch.map((l, idx) => {
      let line = `${idx + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`;
      if (l.description) {
        line += `\n   Description: ${l.description.slice(0, 200)}`;
      }
      return line;
    }).join("\n");

    const prompt = `You are classifying eBay sold listings for the lens: "${lensName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${lensName}" (exact model — correct focal length, aperture, brand, and mount).
- Mark isRelevant=false for: different models, bundled with a camera body, parts/repair, untested, broken, lots/bundles, accessories only.
- conditionGrade "skip" should be used for anything not in working condition or with optical defects — these will be filtered out entirely.

Condition grading — be strict, most used lenses are "good", not "excellent":
- excellent: ONLY if explicitly described as mint, near-mint, [N MINT], [Top MINT], [MINT in Box], or collector grade. Must have no caveats. This is rare — maybe 10-20% of listings.
- good: The default for working lenses. Includes clean optics, smooth focus ring, clean aperture blades, [Exc+5], [Exc+4], Excellent, Very Good, tested/working, CLA'd.
- fair: Any lens with caveats: cosmetic damage noted, minor dust inside, stiff focus ring, oil on aperture blades, "works but...", vague condition claims.
- skip: fungus, mold, haze, scratches on elements, separation, cloudy/foggy optics, broken, for parts, untested.

For each listing provide: isRelevant, isLensOnly, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listingLines}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-2.0-flash-lite",
        output: Output.object({ schema: ClassifiedLensListingSchema }),
        prompt,
      });

      if (output?.listings) {
        allClassified.push(...output.listings);
      }
    } catch (error) {
      console.error(`Classification error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
    }
  }

  return allClassified;
}
