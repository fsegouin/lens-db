import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { dpreviewLensCandidates, lenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DpreviewCandidate } from "@/lib/dpreview-import";
import {
  createLensVersion,
  createPendingLens,
  enrichLensFromCandidate,
  type VersionOptions,
} from "@/lib/dpreview-pipeline";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

/**
 * GET: uncertain duplicates awaiting manual review — candidates the LLM was
 * not ≥90% sure about. Consumed by scraper/dpreview-review-cli.mjs.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      dpreviewSlug: dpreviewLensCandidates.dpreviewSlug,
      dpreviewUrl: dpreviewLensCandidates.dpreviewUrl,
      name: dpreviewLensCandidates.name,
      candidateData: dpreviewLensCandidates.candidateData,
      llmVerdict: dpreviewLensCandidates.llmVerdict,
      llmConfidence: dpreviewLensCandidates.llmConfidence,
      llmReasoning: dpreviewLensCandidates.llmReasoning,
      matchedLensId: lenses.id,
      matchedLensName: lenses.name,
      matchedLensSlug: lenses.slug,
      matchedLensYear: lenses.yearIntroduced,
    })
    .from(dpreviewLensCandidates)
    .leftJoin(lenses, eq(dpreviewLensCandidates.lensId, lenses.id))
    .where(eq(dpreviewLensCandidates.status, "review"));

  return NextResponse.json({ items: rows });
}

function optionalLabel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= 100
    ? value.trim()
    : undefined;
}

/**
 * POST: resolve one review item.
 *
 * Body: { dpreviewSlug: string, decision: "duplicate" | "new" | "version",
 *         existingLabel?, newLabel?, renameExistingTo? }
 * - "duplicate" → the matched lens is enriched with the scraped data
 * - "new" → the candidate is queued as a new-lens pending edit
 * - "version" → the matched lens and the candidate become versions of the
 *   same product: both join a version group, the existing lens is optionally
 *   labeled/renamed (slug preserved), the new version is created directly
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    dpreviewSlug?: unknown;
    decision?: unknown;
    existingLabel?: unknown;
    newLabel?: unknown;
    renameExistingTo?: unknown;
  } | null;
  const dpreviewSlug = typeof body?.dpreviewSlug === "string" ? body.dpreviewSlug : null;
  const decision =
    body?.decision === "duplicate" || body?.decision === "new" || body?.decision === "version"
      ? body.decision
      : null;
  if (!dpreviewSlug || !decision) {
    return NextResponse.json(
      { error: "dpreviewSlug and decision ('duplicate' | 'new' | 'version') required" },
      { status: 400 },
    );
  }
  const versionOpts: VersionOptions = {
    existingLabel: optionalLabel(body?.existingLabel),
    newLabel: optionalLabel(body?.newLabel),
    renameExistingTo: optionalLabel(body?.renameExistingTo),
  };

  const [row] = await db
    .select()
    .from(dpreviewLensCandidates)
    .where(eq(dpreviewLensCandidates.dpreviewSlug, dpreviewSlug))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  }
  if (row.status !== "review") {
    return NextResponse.json(
      { error: `Candidate is not awaiting review (status: ${row.status})` },
      { status: 400 },
    );
  }
  const candidate = row.candidateData as DpreviewCandidate | null;
  if (!candidate) {
    return NextResponse.json({ error: "Candidate data missing" }, { status: 500 });
  }

  try {
    if (decision === "duplicate") {
      if (!row.lensId) {
        return NextResponse.json({ error: "No matched lens recorded" }, { status: 500 });
      }
      const enrichment = await enrichLensFromCandidate(row.lensId, candidate);
      await db
        .update(dpreviewLensCandidates)
        .set({ status: "matched" })
        .where(eq(dpreviewLensCandidates.id, row.id));
      return NextResponse.json({
        status: "matched",
        lensId: row.lensId,
        enrichedFields: enrichment.fields,
      });
    }

    if (decision === "version") {
      if (!row.lensId) {
        return NextResponse.json({ error: "No matched lens recorded" }, { status: 500 });
      }
      const result = await createLensVersion(row.lensId, candidate, versionOpts);
      await db
        .update(dpreviewLensCandidates)
        .set({ status: "imported", lensId: result.newLensId })
        .where(eq(dpreviewLensCandidates.id, row.id));
      return NextResponse.json({
        status: "version",
        newLensId: result.newLensId,
        newSlug: result.newSlug,
        versionGroupId: result.versionGroupId,
      });
    }

    const pendingEditId = await createPendingLens(candidate);
    await db
      .update(dpreviewLensCandidates)
      .set({ status: "pending", pendingEditId, lensId: null })
      .where(eq(dpreviewLensCandidates.id, row.id));
    return NextResponse.json({ status: "created", pendingEditId });
  } catch (error) {
    console.error(`[dpreview-review] Error resolving ${dpreviewSlug}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
