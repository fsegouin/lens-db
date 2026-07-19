import { generateText, Output } from "ai";
import { z } from "zod";

const ClassifiedListingSchema = z.object({
  listings: z.array(
    z.object({
      isRelevant: z.boolean().describe(
        "True only if: (1) this is the exact target camera model, (2) it's in working condition (not for parts/repair/broken/untested), (3) it's a single item (not a lot)",
      ),
      isBodyOnly: z.boolean().describe(
        "True if the listing is for the camera body only (no lens included)",
      ),
      includesLens: z.string().nullable().describe(
        "If a lens is included, describe it (e.g. 'FD 50mm f/1.8'). Null if body only.",
      ),
      conditionGrade: z.enum(["excellent", "good", "fair", "skip"]).describe(
        "Be strict — most cameras are 'good'. excellent: ONLY mint/near-mint/top-mint with zero caveats (10-20% of listings). good: the default for any working camera in decent shape — Exc+5, Very Good, tested, CLA'd, refurbished. fair: working but with noted issues, cosmetic damage, needs work, or vague condition claims. skip: broken, parts, untested.",
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

export type ClassifiedListing = z.infer<typeof ClassifiedListingSchema>["listings"][number];

export interface RawListing {
  title: string;
  price: number;
  date: string;
  condition?: string;
  description?: string;
  url?: string;
}

const BATCH_SIZE = 20;

// Placeholder used to keep positional alignment with the raw listings when a
// batch fails or the LLM returns a different number of entries than requested.
// isRelevant=false + conditionGrade="skip" guarantees it is never stored.
function placeholderListing(): ClassifiedListing {
  return {
    isRelevant: false,
    isBodyOnly: false,
    includesLens: null,
    conditionGrade: "skip",
    conditionNotes: "classification unavailable",
    effectivePrice: 0,
  };
}

export async function classifyListings(
  cameraName: string,
  listings: RawListing[],
): Promise<ClassifiedListing[]> {
  const allClassified: ClassifiedListing[] = [];
  let anyBatchSucceeded = false;
  let lastError: unknown;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    const listingLines = batch.map((l, idx) => {
      let line = `${idx + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`;
      if (l.description) {
        line += `\n   Description: ${l.description.slice(0, 200)}`;
      }
      return line;
    }).join("\n");

    const prompt = `You are classifying eBay sold listings for the camera: "${cameraName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${cameraName}" (exact model, not a variant like "AE-1 Program" vs "AE-1").
- Mark isRelevant=false for: parts/repair, untested, broken, lots/bundles, different models, accessories only.
- conditionGrade "skip" should be used for anything not in working condition — these will be filtered out entirely.

Condition grading — be strict, most used cameras are "good", not "excellent":
- excellent: ONLY if explicitly described as mint, near-mint, [N MINT], [Top MINT], [MINT in Box], or collector grade. Must have no caveats. This is rare — maybe 10-20% of listings.
- good: The default for working cameras. Includes [Exc+5], [Exc+4], Excellent, Very Good, tested/working, CLA'd, Good Refurbished, Very Good Refurbished. Most listings should be here.
- fair: Any camera with caveats: *Read, cosmetic damage noted, "works but...", needs light seals, minor issues mentioned, no condition info given, just "body only" with no condition claim.

For each listing provide: isRelevant, isBodyOnly, includesLens, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listingLines}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-3.1-flash-lite",
        output: Output.object({ schema: ClassifiedListingSchema }),
        prompt,
      });

      // Pad/truncate to exactly batch.length so downstream positional joins
      // (classified[i] ↔ raw[i]) never shift when the LLM miscounts.
      const results = (output?.listings ?? []).slice(0, batch.length);
      while (results.length < batch.length) {
        results.push(placeholderListing());
      }
      allClassified.push(...results);
      anyBatchSucceeded = true;
    } catch (error) {
      console.error(`Classification error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
      lastError = error;
      // Preserve alignment: emit one placeholder per raw listing in the failed batch.
      for (let j = 0; j < batch.length; j++) {
        allClassified.push(placeholderListing());
      }
    }
  }

  // If every batch failed, surface the error instead of returning [] —
  // an empty result here would be indistinguishable from "no relevant listings"
  // and the caller would wrongly mark the camera as freshly scraped.
  if (listings.length > 0 && !anyBatchSucceeded && lastError !== undefined) {
    throw new Error(`Classification failed for all batches of "${cameraName}"`, {
      cause: lastError,
    });
  }

  return allClassified;
}
