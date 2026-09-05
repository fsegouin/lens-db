import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * A leaner classifier for the asking-price ingest.
 *
 * The scraped pipeline's classifier returns five fields per listing, of which
 * this ingest reads two: it never uses isLensOnly, never uses effectivePrice
 * (the Browse API gives an authoritative one), and never reads conditionNotes,
 * which is free prose. At 20 listings a call that prose was most of the output
 * bill, so it is not asked for here.
 *
 * The judgement itself is unchanged. The strictness rules are what stop a
 * "Canon EF" search pricing a 1973 body off EF-mount lenses, so they are kept
 * in full even though they cost input tokens.
 */

const RelevanceSchema = z.object({
  items: z.array(
    z.object({
      relevant: z
        .boolean()
        .describe("True only if this listing is the exact target model, working, sold on its own."),
      grade: z
        .enum(["excellent", "good", "fair", "skip"])
        .describe("Condition. Use skip for anything not in working order."),
    }),
  ),
});

/** LLM grade to the grade stored on sales. */
const GRADE_MAP: Record<string, string> = {
  excellent: "A",
  good: "B",
  fair: "C",
};

export interface RelevanceInput {
  title: string;
  price: number;
  condition?: string | null;
}

export interface RelevanceVerdict {
  isRelevant: boolean;
  /** Null when judged irrelevant, or graded skip. */
  grade: string | null;
}

const BATCH_SIZE = 20;

/**
 * Judge a batch of listings against one product name.
 *
 * Returns one entry per input, positionally. A null entry means the classifier
 * never answered for that listing, which callers must treat as unknown rather
 * than as a rejection: the whole pipeline's worst failures have come from
 * recording an unanswered question as an answer.
 */
export async function classifyRelevance(
  kind: "lens" | "camera",
  name: string,
  listings: RelevanceInput[],
): Promise<(RelevanceVerdict | null)[]> {
  const out: (RelevanceVerdict | null)[] = [];
  const thing = kind === "lens" ? "lens" : "camera body";

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    const lines = batch
      .map((l, idx) => `${idx + 1}. "${l.title}" | $${l.price}${l.condition ? ` | ${l.condition}` : ""}`)
      .join("\n");

    const prompt = `Classify these eBay listings against the ${thing}: "${name}".

relevant=true only for a working "${name}" sold on its own. Mark false for:
- a different model. Designations are part of the identity: AI, AI-S, AF, AF-D, AF-S, D, G, E, EX, DG, VR, IS, USM, STM, L, II, III and mount suffixes all distinguish otherwise similar names.
- a different manufacturer, however close the specification.
- a zoom offered against a prime, or a lens whose range merely contains the target focal length.
- accessories: caps, hoods, filters, adapters, cases, manuals.
- bundles with a body or other gear, lots, parts, untested or broken items.

grade, strictly (most working items are "good"):
- excellent: explicitly mint or near-mint with no caveats. Uncommon.
- good: the default for a clean working item.
- fair: cosmetic damage, dust, stiff focus, oil on blades, vague claims.
- skip: fungus, haze, scratched glass, separation, broken, for parts, untested.

Listings:
${lines}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-3.1-flash-lite",
        output: Output.object({ schema: RelevanceSchema }),
        prompt,
        timeout: 60_000,
      });

      const items = output?.items ?? [];
      for (let j = 0; j < batch.length; j++) {
        const v = items[j];
        if (!v) {
          // The model returned fewer entries than asked. Unknown, not rejected.
          out.push(null);
          continue;
        }
        const relevant = v.relevant && v.grade !== "skip";
        out.push({
          isRelevant: relevant,
          grade: relevant ? (GRADE_MAP[v.grade] ?? null) : null,
        });
      }
    } catch (error) {
      console.error(
        `[classify-relevance] batch ${Math.floor(i / BATCH_SIZE) + 1} of "${name}" failed:`,
        error,
      );
      for (let j = 0; j < batch.length; j++) out.push(null);
    }
  }

  return out;
}
