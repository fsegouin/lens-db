import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { kehProducts, lenses } from "@/db/schema";
import { sql, eq, isNull, and, inArray } from "drizzle-orm";
import { matchKehProducts, parseKehTitle, type KehCandidateSet } from "@/lib/keh-match";

/**
 * Works through the mirrored KEH catalogue deciding which of our lenses each
 * product is, if any.
 *
 * Costs nothing at KEH: the catalogue is already local, so this is database
 * work plus the classifier. Every product gets exactly one verdict and is
 * then left alone, which is why the queue drains rather than recirculating.
 */

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 300;

/**
 * Most candidates a product may be shown. Beyond a handful the question stops
 * being "which of these" and starts being a haystack, and the honest answer to
 * a haystack is none.
 */
const MAX_CANDIDATES = 6;

/** Focal lengths are written to the millimetre; apertures need slack for float. */
const APERTURE_TOLERANCE = 0.05;

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const pending = await db
    .select({
      id: kehProducts.id,
      kehId: kehProducts.kehId,
      title: kehProducts.title,
    })
    .from(kehProducts)
    .where(isNull(kehProducts.matchState))
    .orderBy(kehProducts.id)
    .limit(limit);

  const counts = {
    examined: 0,
    unparseable: 0,
    noCandidates: 0,
    matched: 0,
    noMatch: 0,
    classifierFailed: 0,
  };
  const sets: KehCandidateSet[] = [];
  const settled: string[] = [];

  for (const p of pending) {
    counts.examined++;
    const parsed = parseKehTitle(p.title);
    if (!parsed || parsed.aperture == null) {
      // No focal length or aperture in the title means nothing to narrow on,
      // and asking the model to guess from prose invites exactly the wrong
      // answers this step exists to prevent.
      counts.unparseable++;
      settled.push(p.kehId);
      continue;
    }

    const candidates = await db
      .select({ id: lenses.id, name: lenses.name })
      .from(lenses)
      .where(
        and(
          isNull(lenses.mergedIntoId),
          eq(lenses.focalLengthMin, parsed.focalMin),
          eq(lenses.focalLengthMax, parsed.focalMax),
          sql`abs(${lenses.apertureMin} - ${parsed.aperture}) <= ${APERTURE_TOLERANCE}`,
        ),
      )
      .limit(MAX_CANDIDATES);

    if (candidates.length === 0) {
      // KEH stocks plenty we do not list. Recording that costs no LLM call.
      counts.noCandidates++;
      settled.push(p.kehId);
      continue;
    }

    sets.push({ kehId: p.kehId, kehTitle: p.title, candidates });
  }

  // Products with no candidate at all are settled without asking anyone.
  if (settled.length > 0) {
    await db
      .update(kehProducts)
      .set({ matchState: "no_match", matchedAt: new Date() })
      .where(inArray(kehProducts.kehId, settled));
    counts.noMatch += settled.length;
  }

  if (sets.length > 0) {
    const verdicts = await matchKehProducts(sets);
    for (const v of verdicts) {
      if (v.failed) {
        // Left unexamined on purpose, so the next run asks again.
        counts.classifierFailed++;
        continue;
      }
      if (v.lensId != null) {
        await db
          .update(kehProducts)
          .set({
            entityType: "lens",
            entityId: v.lensId,
            matchState: "matched",
            matchedAt: new Date(),
          })
          .where(eq(kehProducts.kehId, v.kehId));
        counts.matched++;
      } else {
        await db
          .update(kehProducts)
          .set({ matchState: "no_match", matchedAt: new Date() })
          .where(eq(kehProducts.kehId, v.kehId));
        counts.noMatch++;
      }
    }
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)` })
    .from(kehProducts)
    .where(isNull(kehProducts.matchState));
  const [{ totalMatched }] = await db
    .select({ totalMatched: sql<number>`count(*)` })
    .from(kehProducts)
    .where(eq(kehProducts.matchState, "matched"));

  // When most of what we asked never came back, the run learned nothing and
  // saying so is the point: a caller looping until the queue drains would
  // otherwise spin forever against a classifier that is down, and the queue
  // would never drain because failures no longer settle anything.
  const degraded = sets.length > 0 && counts.classifierFailed > sets.length / 2;

  return NextResponse.json({
    ...counts,
    askedClassifier: sets.length,
    degraded,
    remaining: Number(remaining),
    totalMatched: Number(totalMatched),
  });
}
