import { generateText, Output } from "ai";
import { z } from "zod";
import type { DpreviewCameraCandidate } from "@/lib/dpreview-camera-import";

/**
 * LLM verdict on whether a scraped DPReview body and an existing DB camera
 * are the same product. The lens counterpart is dpreview-dedupe-llm.ts.
 *
 * The verdict is binary here, where the lens one has three values. A lens
 * generation joins its predecessor in a lens_version_groups row, so
 * "new_version" is a distinct outcome with its own handling; a camera
 * generation is just another cameras row, so a successor body is simply
 * "new_camera".
 */

// A deterministic match only auto-resolves as a duplicate when the LLM is at
// least this confident; anything less lands in the manual review queue
// (ENTITY=cameras scraper/dpreview-review-cli.mjs).
export const CAMERA_DUPLICATE_CONFIDENCE_THRESHOLD = 0.9;

const CameraDuplicateVerdictSchema = z.object({
  verdict: z
    .enum(["duplicate", "new_camera"])
    .describe(
      "'duplicate': both entries are the same camera body. An IDENTICAL full name — including any generation marker like II, III, Mark II — means duplicate. Note that 'Mark II' and 'II' are the same marker written two ways, so 'EOS R5 Mark II' and 'EOS R5 II' are the SAME camera. " +
        "'new_camera': a distinct body. This INCLUDES a different generation of the same line (OM-1 vs OM-1 Mark II, a7 IV vs a7 V, Z5 vs Z5II) — each generation is its own record in this database, so a successor is never a duplicate. It also includes sibling variants announced together that differ by a suffix (Lumix DC-S1II vs DC-S1IIE, a7C vs a7CR), and video-oriented or astro variants of a stills body (EOS R5 vs EOS R5 C).",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How certain the verdict is, from 0 to 1. Use values below 0.9 whenever the evidence is genuinely ambiguous — in particular when the two names differ only by a suffix you cannot confidently attribute to a variant rather than a typo.",
    ),
  reasoning: z.string().describe("One or two short sentences explaining the verdict."),
});

export type CameraDuplicateVerdict = z.infer<typeof CameraDuplicateVerdictSchema>;

export interface DbCameraFacts {
  name: string;
  yearIntroduced: number | null;
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
  bodyType: string | null;
  weightG: number | null;
  systemName: string | null;
}

export async function judgeCameraDuplicate(
  candidate: DpreviewCameraCandidate,
  dbCamera: DbCameraFacts,
): Promise<CameraDuplicateVerdict> {
  const specs = candidate.specTable;

  const prompt = `Decide whether these two camera-body entries are the same product ("duplicate") or distinct products ("new_camera").

Entry A — newly scraped from DPReview:
Name: ${candidate.name}
Announced: ${candidate.year ?? specs["Announced"] ?? "unknown"}
Body type: ${specs["Body type"] || "unknown"}
Sensor: ${specs["Sensor type"] || "unknown"}, ${specs["Sensor size"] || "unknown"}, ${specs["Effective pixels"] || "unknown"}
Lens mount: ${specs["Lens mount"] || "fixed lens / not stated"}
Weight: ${specs["Weight (inc. batteries)"] || "unknown"}
Source: ${candidate.dpreviewUrl}

Entry B — existing database record:
Name: ${dbCamera.name}
Year introduced: ${dbCamera.yearIntroduced ?? "unknown"}
Body type: ${dbCamera.bodyType ?? "unknown"}
Sensor: ${dbCamera.sensorType ?? "unknown"}, ${dbCamera.sensorSize ?? "unknown"}, ${dbCamera.megapixels !== null ? `${dbCamera.megapixels} MP` : "unknown"}
Mount system: ${dbCamera.systemName ?? "fixed lens / not recorded"}
Weight: ${dbCamera.weightG !== null ? `${dbCamera.weightG} g` : "unknown"}

Guidance:
- Camera generations are separate records here. If the names differ by a generation marker (II, III, IV, Mark II, "s", "x", "R", "C"), that is "new_camera", not a duplicate, even when the sensor and weight are near-identical — successive generations routinely reuse a sensor.
- The single exception is notation: "Mark II" and "II" mean the same generation. "Canon EOS R5 Mark II" and "Canon EOS R5 II" are one camera; "Canon EOS R5" and "Canon EOS R5 Mark II" are two.
- Identical full names with matching sensor and weight are conclusively the same body.
- Announced dates from DPReview's catalog are unreliable for older products: their pages are stamped with a re-publication year, so a large year gap is not by itself evidence of a successor. Judge on the name and specifications.
- A body sold under regional names (a6700 / ZV-E10 II) is still distinct if the model designations differ.`;

  const { output } = await generateText({
    model: "google/gemini-3.1-flash-lite",
    output: Output.object({ schema: CameraDuplicateVerdictSchema }),
    prompt,
    timeout: 60_000,
  });

  return output;
}
