import { experimental_evaluate as evaluate } from "ai7";
import type { RawListing } from "@/lib/price-classify";

/**
 * Second opinion on the sold-listing classifier, from an evaluation model.
 *
 * Runs beside the live Gemini classifier and never decides what is stored: its
 * verdicts are written to ebay_sold_verdicts under their own model name so the
 * two can be compared on the same listings by a query rather than a rerun.
 *
 * The two do not grade on the same scale. Gemini can answer "relevant but
 * skip", so the pipeline accepts on `is_relevant AND grade <> 'skip'`, while
 * this model has no skip rung and accepts on probability alone. Comparing the
 * `is_relevant` columns directly overstates this model's accepts by exactly
 * the relevant-but-skip rows, so a comparison query has to apply the grade
 * condition to both sides.
 */
export const JEV_MODEL = process.env.JEV_MODEL || "typesafe-ai/jev";

/**
 * Share of entities to shadow, 0 to 1. Off unless set: every shadowed listing
 * is a request, and a full sweep would roughly double the wall clock of a
 * 400-entity run.
 */
const rawShadowRate = Number(process.env.JEV_SHADOW_RATE || "0");
export const JEV_SHADOW_RATE = Number.isFinite(rawShadowRate)
  ? Math.min(Math.max(rawShadowRate, 0), 1)
  : 0;

/**
 * Accept above this probability.
 *
 * Measured on 300 listings from the 18 Sep sweep, thresholds fitted on half and
 * scored on the held-out half: 0.8 gives no false accepts against a reference
 * of two frontier models, at the cost of missing about 8% of real sales. The
 * model's probabilities are compressed, so this is not the 0.9+ it looks like:
 * an exactly matching title scores around 0.8.
 */
export const JEV_ACCEPT_ABOVE = 0.8;

/**
 * Ceiling on a single call. `evaluate` imposes none of its own, and an
 * unbounded one cannot be caught: a promise that never settles is not a
 * rejection, so the whole route would sit until maxDuration killed it.
 */
const CALL_TIMEOUT_MS = 20_000;

/** Score cuts for the three condition rungs, same ladder the Gemini prompt uses. */
const GRADE_EXCELLENT_ABOVE = 1.6;
const GRADE_GOOD_ABOVE = 0.7;

export interface JevVerdict {
  isRelevant: boolean;
  conditionGrade: "excellent" | "good" | "fair";
  /** isTargetModel probability, kept so thresholds can be re-cut offline. */
  probability: number;
}

/**
 * Only the two questions that earned their place. `isSoldAlone` and
 * `isWorking` were measured on the same sample and their fitted thresholds
 * came out at 0.3, low enough that neither changed a verdict, so asking them
 * bought nothing and cost instruction tokens on every call.
 */
function questions(entityType: string) {
  const thing = entityType === "lens" ? "lens" : "camera";
  return {
    isTargetModel: {
      type: "boolean" as const,
      instructions:
        `Is this listing for the exact ${thing} named in target? Designations are part of the model identity: ` +
        `AF vs AF-D vs AF-S vs AF-P are different lines; D, G, E, S, VR, II, III, ED, L, IS, USM, STM change the model. ` +
        `A word in the middle of the name counts as much as a suffix: Shift, Tilt, PC, Macro, Micro, Fisheye, Mirror, ` +
        `Reflex, APO, Soft and Zero-D name a different ${thing}, not a variant. Focal length and maximum aperture are ` +
        `part of the identity: 28mm f/2.8 is not 28mm f/3.5, and a zoom 28-80mm is not a prime 28mm. A lot or a bundle ` +
        `of several items is not this ${thing}. When the title is ambiguous, answer false: a missing sale costs one ` +
        `data point, a wrong one moves the published price for everybody.`,
      criteria: {
        true: `one ${thing}, and brand, focal length, aperture, mount and every designation match`,
        false: "a different model, a different manufacturer, a lot or bundle, or accessories only",
      },
    },
    condition: {
      type: "score" as const,
      instructions: `Grade the condition. Be strict: most working ${thing}s are the middle level.`,
      criteria: [
        'caveats: damage, dust, stiff controls, "works but...", broken, for parts, untested, fungus or haze',
        `a clean working ${thing}: Exc+4/Exc+5, Very Good, tested, CLA'd, refurbished`,
        "explicitly mint, near-mint or collector grade, with no caveats",
      ],
    },
  };
}

/**
 * Judge one listing. Returns null when the call fails: a shadow verdict is
 * never worth failing a run over.
 */
async function judge(
  entityType: string,
  targetName: string,
  listing: RawListing,
): Promise<JevVerdict | null> {
  try {
    const res = await evaluate({
      model: JEV_MODEL,
      state: {
        target: targetName,
        title: listing.title,
        priceUsd: listing.price,
        ebayCondition: listing.condition ?? "unknown",
      },
      questions: questions(entityType),
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const probability = res.answers.isTargetModel.probability;
    const score = res.answers.condition.score;
    return {
      isRelevant: probability > JEV_ACCEPT_ABOVE,
      conditionGrade:
        score >= GRADE_EXCELLENT_ABOVE
          ? "excellent"
          : score >= GRADE_GOOD_ABOVE
            ? "good"
            : "fair",
      probability,
    };
  } catch {
    return null;
  }
}

/**
 * Judge a whole entity's listings, a few at a time.
 *
 * Concurrency is deliberately low: at 8 the gateway queues hard enough that a
 * 300-listing run went from under a minute to several, with no errors to show
 * for it. Entries are positional against `listings`, null where the call failed.
 */
const CONCURRENCY = 3;

export async function classifyWithJev(
  entityType: string,
  targetName: string,
  listings: RawListing[],
): Promise<(JevVerdict | null)[]> {
  const out: (JevVerdict | null)[] = [];
  for (let i = 0; i < listings.length; i += CONCURRENCY) {
    const batch = listings.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(batch.map((l) => judge(entityType, targetName, l)))));
  }
  return out;
}

/** Whether this entity is in the shadow sample for this run. */
export function shouldShadow(): boolean {
  return JEV_SHADOW_RATE > 0 && Math.random() < JEV_SHADOW_RATE;
}
