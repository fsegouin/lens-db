import { generateText, Output } from "ai";
import { z } from "zod";
import { MOUNT_MAP, type DpreviewCandidate } from "@/lib/dpreview-import";

// Render our actual mount ontology for the prompt: DPReview labels that the
// database files under one system are the same system — never evidence of
// distinct products. Derived from MOUNT_MAP so mapping changes flow through.
const MOUNT_GROUPS = (() => {
  const bySystem = new Map<string, string[]>();
  for (const [label, system] of Object.entries(MOUNT_MAP)) {
    if (!bySystem.has(system)) bySystem.set(system, []);
    bySystem.get(system)!.push(label);
  }
  return [...bySystem.entries()]
    .filter(([system, labels]) => labels.length > 1 || labels[0] !== system)
    .map(([system, labels]) => `  "${labels.join('", "')}" → filed as "${system}"`)
    .join("\n");
})();

/**
 * LLM verdict on whether a scraped DPReview product and an existing DB lens
 * are the same product. Mirrors the price-classify pattern (bare gateway
 * model string, zod-described output).
 */

// A deterministic match only auto-resolves as a duplicate when the LLM is at
// least this confident; anything less lands in the manual review queue
// (scraper/dpreview-review-cli.mjs).
export const DUPLICATE_CONFIDENCE_THRESHOLD = 0.9;

const DuplicateVerdictSchema = z.object({
  verdict: z
    .enum(["duplicate", "new_version", "new_lens"])
    .describe(
      "'duplicate': both entries are the same lens product. An IDENTICAL full name — including any version marker like II or III — means duplicate: manufacturers never reuse an exact name+version for a different lens, and the same optical design sold for multiple mounts counts as one product. Mount-label differences are weak evidence — consult the database's mount filing groups given in the prompt: labels within one group are the same system, and such mismatches never indicate distinct products. " +
      "'new_version': a different GENERATION of the same product line — a successor or predecessor whose name differs by a version marker or era (Mark II/III, Type IV/V, a redesign of the same line years later with different weight). " +
      "'new_lens': a distinct product — a different product line (e.g. an SL-mount lens vs an M-mount lens of the same brand and focal length, named differently), a teleconverter vs a lens, or a different optical design that merely shares brand, focal length and aperture.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How certain the verdict is, from 0 to 1. Use values below 0.9 whenever the evidence is genuinely ambiguous. A mount-label difference within one database filing group is NOT ambiguity.",
    ),
  reasoning: z
    .string()
    .describe("One or two short sentences explaining the verdict."),
});

export type DuplicateVerdict = z.infer<typeof DuplicateVerdictSchema>;

export interface DbLensFacts {
  name: string;
  brand: string | null;
  yearIntroduced: number | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  weightG: number | null;
  systemName: string | null;
}

export async function judgeDuplicate(
  candidate: DpreviewCandidate,
  dbLens: DbLensFacts,
): Promise<DuplicateVerdict> {
  const focal =
    dbLens.focalLengthMin !== null
      ? dbLens.focalLengthMin === dbLens.focalLengthMax
        ? `${dbLens.focalLengthMin}mm`
        : `${dbLens.focalLengthMin}-${dbLens.focalLengthMax}mm`
      : "unknown";

  const prompt = `Decide how these two camera-lens entries relate: the same product ("duplicate"), a different generation of the same product line ("new_version"), or a distinct product ("new_lens").

Entry A — newly scraped from DPReview:
Name: ${candidate.name}
Announced: ${candidate.year ?? candidate.specTable["Announced"] ?? "unknown"}
Mounts: ${candidate.specTable["Lens mount"] || candidate.mounts || "unknown"}
Lens type: ${candidate.specTable["Lens type"] || "unknown"}
Weight: ${candidate.specTable["Weight"] || "unknown"}
Source: ${candidate.dpreviewUrl}

Entry B — existing database record:
Name: ${dbLens.name}
Brand: ${dbLens.brand ?? "unknown"}
Year introduced: ${dbLens.yearIntroduced ?? "unknown"}
Mount system: ${dbLens.systemName ?? "unknown"}
Focal length: ${focal}, max aperture: ${dbLens.apertureMin !== null ? `F${dbLens.apertureMin}` : "unknown"}
Weight: ${dbLens.weightG !== null ? `${dbLens.weightG} g` : "unknown"}

Note: mount labels are coarse on both sides and are never decisive on their own. This database's actual mount filing (labels in one group are the SAME system, never evidence of distinct products):
${MOUNT_GROUPS}
Additionally, DPReview does not distinguish Leica M bayonet from M39/M42 screw mounts — it labels them all "Leica M". Judge by optical name, specs and era instead. An identical full name (including version markers like II/III) with matching weight is conclusive: that IS the same lens. Identical weight is strong evidence of the same lens — two distinct optical designs rarely weigh exactly the same. Also, Entry A's announced date comes from DPReview's catalog, which stamps older lenses with the page's re-publication year (verified: their entry for a 2003 lens says "announced 2026") — a large year gap alone is NOT evidence of a successor product; identical name and weight outweigh the dates.`;

  const { output } = await generateText({
    model: "google/gemini-3.1-flash-lite",
    output: Output.object({ schema: DuplicateVerdictSchema }),
    prompt,
    timeout: 60_000,
  });

  return output;
}
