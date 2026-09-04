import { generateText, Output } from "ai";
import { z } from "zod";
import type { RawListing } from "@/lib/price-classify";

const ClassifiedLensListingSchema = z.object({
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

// Placeholder used to keep positional alignment with the raw listings when a
// batch fails or the LLM returns a different number of entries than requested.
// isRelevant=false + conditionGrade="skip" guarantees it is never stored.
function placeholderListing(): ClassifiedLensListing {
  return {
    isRelevant: false,
    isLensOnly: false,
    conditionGrade: "skip",
    conditionNotes: "classification unavailable",
    effectivePrice: 0,
  };
}

/**
 * Words that name a different lens rather than a variant of the same one, and
 * that a genuine listing for that lens practically always states.
 *
 * These are checked in code, not left to the model, because getting one wrong
 * is not a rounding error: a plain Minolta MD 35mm F/2.8 sells for tens of
 * dollars and the Shift CA version for several hundred, so a handful of
 * misattributed listings do not nudge the estimate, they replace it. That lens
 * currently publishes $90-$120 off 15 sales spanning $31 to $761.
 *
 * Deliberately short. "Macro" (668 lenses) and "APO" (289) are left to the
 * prompt: they are common enough, and omitted from honest titles often enough,
 * that a hard rule would throw away real sales. Once titles are being stored
 * alongside prices, that judgement can be measured instead of guessed.
 */
const DISCRIMINATORS = ["shift", "tilt", "pc", "fisheye"] as const;

/** Lowercased, punctuation flattened, so "Tilt-Shift" and "PC-Nikkor" tokenise. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasWord(haystack: string, word: string): boolean {
  if (word === "fisheye") {
    // "fish-eye" and "fish eye" are the same lens written three ways.
    return haystack.replace(/ /g, "").includes("fisheye");
  }
  return haystack.split(" ").includes(word);
}

/**
 * True when the target lens is named by one of the words above and the listing
 * title does not carry it. Ambiguity resolves against relevance on purpose: a
 * dropped sale costs an estimate one data point, a wrong one moves the price
 * shown to everybody.
 */
export function missingDiscriminator(lensName: string, title: string): boolean {
  const name = normalise(lensName);
  const listing = normalise(title);
  return DISCRIMINATORS.some(
    (word) => hasWord(name, word) && !hasWord(listing, word),
  );
}

export async function classifyLensListings(
  lensName: string,
  listings: RawListing[],
): Promise<ClassifiedLensListing[]> {
  const allClassified: ClassifiedLensListing[] = [];
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

    const prompt = `You are classifying eBay sold listings for the lens: "${lensName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${lensName}" (exact model — correct focal length, aperture, brand, and mount).
- Mark isRelevant=false for: different models, bundled with a camera body, parts/repair, untested, broken, lots/bundles, accessories only.
- conditionGrade "skip" should be used for anything not in working condition or with optical defects — these will be filtered out entirely.

MODEL PRECISION — suffixes and designations change the model:
- "AF" vs "AF-D" vs "AF-S" vs "AF-P" are all different lens lines (e.g. "Nikon AF Nikkor 50mm f/1.4" is NOT the same as "Nikon AF Nikkor 50mm f/1.4D").
- Suffixes like D, G, E, S, VR, II, III, ED, L, IS, USM, STM, etc. are part of the model identity.
- Do NOT treat a listing as relevant if it has designations not in the target name, or is missing designations that are in the target name.
- A word in the MIDDLE of the name counts just as much as a suffix. Shift, Tilt, Tilt-Shift, PC, Macro, Micro, Fisheye, Mirror, Reflex, APO, Soft, Zero-D and similar name a different lens, not a variant of the same one, and they are usually the expensive member of the family. "Minolta MD Shift CA 35mm F/2.8" and "Minolta MD 35mm F/2.8" are different lenses that differ by several hundred dollars; a listing for the plain lens is NOT relevant to the shift one, and vice versa.
- If the target name contains such a word and the listing title does not, answer isRelevant=false. Matching brand, focal length and aperture is not enough.
- When the title is ambiguous about this, answer isRelevant=false. A missing sale costs an estimate one data point; a wrong one moves the published price for everybody.

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
        model: "google/gemini-3.1-flash-lite",
        output: Output.object({ schema: ClassifiedLensListingSchema }),
        prompt,
        timeout: 60_000,
      });

      // Pad/truncate to exactly batch.length so downstream positional joins
      // (classified[i] ↔ raw[i]) never shift when the LLM miscounts.
      const results = (output?.listings ?? []).slice(0, batch.length);
      while (results.length < batch.length) {
        results.push(placeholderListing());
      }
      // The model is asked for this in the prompt as well, but a mistake here
      // is expensive and one-directional, so it is enforced rather than hoped
      // for. Only ever turns relevance off.
      for (let j = 0; j < results.length; j++) {
        if (results[j].isRelevant && missingDiscriminator(lensName, batch[j].title)) {
          results[j] = {
            ...results[j],
            isRelevant: false,
            conditionNotes: "rejected: title omits a defining word of the model",
          };
        }
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
  // and the caller would wrongly mark the lens as freshly scraped.
  if (listings.length > 0 && !anyBatchSucceeded && lastError !== undefined) {
    throw new Error(`Classification failed for all batches of "${lensName}"`, {
      cause: lastError,
    });
  }

  return allClassified;
}
