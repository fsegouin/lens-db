import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Decides which of our lenses a KEH product is, if any.
 *
 * The matching runs product-first rather than lens-first because the KEH
 * catalogue is the smaller set (~4,700 against our 9,300) and each product
 * needs exactly one verdict, which is then recorded against it and never
 * revisited.
 *
 * The LLM step is not optional. Token overlap alone matched a Helios 44-2 to
 * a 58mm UV filter and a Pentax zoom to a Sigma, confidently, and a wrong
 * match here puts another lens's price on the page. Deterministic parsing
 * narrows the field; the model decides.
 */

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      candidateNumber: z
        .number()
        .describe(
          "The number of the candidate lens that is the SAME model as the KEH product, or 0 if none of them is.",
        ),
      confident: z
        .boolean()
        .describe(
          "True only if the model designation matches exactly, not merely the focal length and aperture.",
        ),
    }),
  ),
});

export interface KehCandidateSet {
  kehId: string;
  kehTitle: string;
  /** Our lenses that share this product's focal length and aperture. */
  candidates: { id: number; name: string }[];
}

export interface KehMatchVerdict {
  kehId: string;
  lensId: number | null;
  /**
   * True when the classifier never actually answered. Distinct from a null
   * lensId, which is the classifier saying none of the candidates fit: one is
   * a verdict to record, the other is a question still outstanding, and
   * conflating them writes "no match" for a check that never ran.
   */
  failed: boolean;
}

const BATCH_SIZE = 12;

/**
 * Resolve a batch of KEH products to lens ids.
 *
 * A product whose batch fails resolves to null, which records it as unmatched
 * rather than mismatched. Missing a price is recoverable; publishing the wrong
 * one is not.
 */
export async function matchKehProducts(
  sets: KehCandidateSet[],
): Promise<KehMatchVerdict[]> {
  const out: KehMatchVerdict[] = [];

  for (let i = 0; i < sets.length; i += BATCH_SIZE) {
    const batch = sets.slice(i, i + BATCH_SIZE);

    const body = batch
      .map((s, idx) => {
        const cands = s.candidates
          .map((c, n) => `     ${n + 1}. ${c.name}`)
          .join("\n");
        return `${idx + 1}. KEH product: "${s.kehTitle}"\n   Candidates:\n${cands}`;
      })
      .join("\n\n");

    const prompt = `Each item below is a lens listed for sale by the dealer KEH, followed by numbered candidate lenses from our database that share its focal length and maximum aperture.

For each item, say which candidate is the SAME lens model as the KEH product, or 0 if none of them is.

Be strict. Sharing a focal length and aperture is not enough:
- Designations are part of the model identity. AI, AI-S, AF, AF-D, AF-S, D, G, E, EX, DG, VR, IS, USM, STM, L, II, III and mount suffixes all distinguish otherwise identical-sounding lenses.
- A manual-focus lens is never the same model as an autofocus one.
- A different manufacturer is never a match, however similar the specification. Third-party lenses (Sigma, Tamron, Tokina, Vivitar, Samyang) are their own models even when made for another brand's mount.
- A zoom is never a prime, and a lens covering 55-210mm is not a 210mm lens.
- If two candidates are plausible and you cannot tell them apart, answer 0.

Set confident=true only where the designation matches exactly, not merely the numbers.

Items:
${body}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-3.1-flash-lite",
        output: Output.object({ schema: MatchSchema }),
        prompt,
        timeout: 60_000,
      });

      const verdicts = output?.matches ?? [];
      batch.forEach((s, idx) => {
        const v = verdicts[idx];
        const n = v?.candidateNumber ?? 0;
        const picked =
          v?.confident && n >= 1 && n <= s.candidates.length
            ? s.candidates[n - 1].id
            : null;
        out.push({ kehId: s.kehId, lensId: picked, failed: false });
      });
    } catch (error) {
      console.error(`[keh-match] batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
      // Not a verdict. These stay unexamined so the next run asks again: an
      // outage in the classifier must not be recorded as an answer about the
      // product, or a gateway with no credit quietly decides that nothing in
      // the catalogue matches anything.
      for (const s of batch) out.push({ kehId: s.kehId, lensId: null, failed: true });
    }
  }

  return out;
}

/**
 * Focal length and maximum aperture as written in a KEH title, which is the
 * only reliably structured part of it. Everything else about the model is
 * left to the classifier.
 *
 * Examples: "Nikon 28mm f/2.8 NIKKOR AIS Manual Focus Lens {52}",
 * "Sony E 55-210mm f/4.5-6.3 OSS Autofocus APS-C Lens for E-Mount".
 */
export function parseKehTitle(title: string): {
  focalMin: number;
  focalMax: number;
  aperture: number | null;
} | null {
  const zoom = title.match(/(\d{1,4})\s*-\s*(\d{1,4})\s*mm/i);
  const prime = title.match(/(\d{1,4})\s*mm/i);
  if (!zoom && !prime) return null;

  const focalMin = zoom ? Number(zoom[1]) : Number(prime![1]);
  const focalMax = zoom ? Number(zoom[2]) : focalMin;
  if (!Number.isFinite(focalMin) || focalMin <= 0) return null;

  // The first f-number is the maximum aperture; a variable zoom lists the
  // long end second and we ignore it, matching how we store apertureMin.
  //
  // The slash is required. Without it the f is just a letter, and the letter
  // before a number is exactly what a modern mount name looks like: "Canon RF
  // 50mm f/1.8" was read as f/50, "Fujifilm XF 16-55mm f/2.8" as f/16. That
  // aperture then matched no lens we hold, so 206 products, most of the RF,
  // XF and GF catalogue, were quietly settled as belonging to nothing.
  const ap = title.match(/\bf\/\s*(\d+(?:\.\d+)?)/i);
  return {
    focalMin,
    focalMax,
    aperture: ap ? Number(ap[1]) : null,
  };
}
