import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Post-hoc extraction audit: given the raw spec table stored alongside a lens
 * (specs jsonb) and the structured columns the pipeline extracted from it, an
 * LLM flags contradictions. Deterministic extraction stays the source of
 * truth — this is a verification report, it never writes data.
 */

const SpecAuditSchema = z.object({
  ok: z
    .boolean()
    .describe(
      "true when every extracted column is consistent with the raw spec table and the lens name.",
    ),
  issues: z.array(
    z.object({
      field: z.string().describe("Extracted column name, e.g. focalLengthMin, weightG."),
      problem: z
        .enum(["wrong", "missing"])
        .describe(
          "'wrong' = the column clearly contradicts the raw table or name. 'missing' = the raw table clearly contains this datum but the column is null.",
        ),
      rawValue: z.string().describe("What the raw table or name says."),
      extractedValue: z.string().describe("What the column holds ('null' if empty)."),
      suggestedValue: z
        .string()
        .describe(
          "The value the column should hold according to the raw table, as a plain string ('654' for numbers, 'true'/'false' for booleans). Empty string if no confident correction exists.",
        ),
    }),
  ),
});

export type SpecAudit = z.infer<typeof SpecAuditSchema>;

export async function auditLensSpecs(
  name: string,
  rawSpecs: Record<string, unknown>,
  columns: Record<string, unknown>,
): Promise<SpecAudit> {
  const prompt = `A lens database extracted structured columns from a raw specification table. Verify the extraction.

Lens name: ${name}

Raw specification table (source of truth, scraped as-is):
${JSON.stringify(rawSpecs, null, 1)}

Extracted columns:
${JSON.stringify(columns, null, 1)}

Rules:
- Flag "wrong" ONLY for clear numeric/factual contradictions (e.g. weight 654 g in the table but weightG 250; the table says 9 blades but diaphragmBlades is 8; focal length in the name is 35mm but focalLengthMin is 85).
- Flag "missing" ONLY when the table unambiguously contains a datum whose column is null.
- A column HOLDING a value that the table does not mention is NEVER an issue — several columns (yearIntroduced, coverage, lensType, isMacro, and others) are legitimately filled from sources outside this table (catalog dates, the lens name, prior database records). Do not flag them unless the table or name directly CONTRADICTS the value.
- Notation differences are NEVER issues: "F/2" vs 2 vs "F2" are the same aperture; "654 g / 1.4 lb" vs 654 is the same weight; "0.17×" vs 0.17 is the same magnification. Compare numbers, not formatting.
- apertureMin holds the BRIGHTEST (maximum) aperture, apertureMax the dimmest (minimum aperture, like F22) — that naming is intentional. For variable-aperture zooms ("F5.6-8"), apertureMin correctly holds the first number; a null apertureMax is only "missing" if the table lists an explicit "Minimum aperture" row.
- Columns not derivable from the table (viewCount, slug, ids, description) are out of scope.
- Be conservative: when in doubt, it is not an issue. An empty issues list with ok=true is the expected result for most lenses.`;

  const { output } = await generateText({
    model: "google/gemini-3.1-flash-lite",
    output: Output.object({ schema: SpecAuditSchema }),
    prompt,
    timeout: 60_000,
  });

  return output;
}
