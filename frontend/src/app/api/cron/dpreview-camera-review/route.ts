import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { cameras, dpreviewCameraCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DpreviewCameraCandidate } from "@/lib/dpreview-camera-import";
import {
  createPendingCamera,
  enrichCameraFromCandidate,
} from "@/lib/dpreview-camera-pipeline";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

/**
 * GET: uncertain duplicates awaiting manual review — candidates the LLM was
 * not ≥90% sure about. Consumed by scraper/dpreview-review-cli.mjs with
 * ENTITY=cameras.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      dpreviewSlug: dpreviewCameraCandidates.dpreviewSlug,
      dpreviewUrl: dpreviewCameraCandidates.dpreviewUrl,
      name: dpreviewCameraCandidates.name,
      candidateData: dpreviewCameraCandidates.candidateData,
      llmVerdict: dpreviewCameraCandidates.llmVerdict,
      llmConfidence: dpreviewCameraCandidates.llmConfidence,
      llmReasoning: dpreviewCameraCandidates.llmReasoning,
      matchedCameraId: cameras.id,
      matchedCameraName: cameras.name,
      matchedCameraSlug: cameras.slug,
      matchedCameraYear: cameras.yearIntroduced,
    })
    .from(dpreviewCameraCandidates)
    .leftJoin(cameras, eq(dpreviewCameraCandidates.cameraId, cameras.id))
    .where(eq(dpreviewCameraCandidates.status, "review"));

  return NextResponse.json({ items: rows });
}

/**
 * POST: resolve one review item.
 *
 * Body: { dpreviewSlug: string, decision: "duplicate" | "new" }
 * - "duplicate" → the matched camera is enriched with the scraped data
 * - "new" → the candidate is queued as a new-camera pending edit
 *
 * There is no "version" decision to match the lens route's: a camera
 * generation is its own row, so a successor body is simply "new".
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    dpreviewSlug?: unknown;
    decision?: unknown;
  } | null;
  const dpreviewSlug = typeof body?.dpreviewSlug === "string" ? body.dpreviewSlug : null;
  const decision =
    body?.decision === "duplicate" || body?.decision === "new" ? body.decision : null;
  if (!dpreviewSlug || !decision) {
    return NextResponse.json(
      { error: "dpreviewSlug and decision ('duplicate' | 'new') required" },
      { status: 400 },
    );
  }

  const [row] = await db
    .select()
    .from(dpreviewCameraCandidates)
    .where(eq(dpreviewCameraCandidates.dpreviewSlug, dpreviewSlug))
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
  const candidate = row.candidateData as DpreviewCameraCandidate | null;
  if (!candidate) {
    return NextResponse.json({ error: "Candidate data missing" }, { status: 500 });
  }

  try {
    if (decision === "duplicate") {
      if (!row.cameraId) {
        return NextResponse.json({ error: "No matched camera recorded" }, { status: 500 });
      }
      const enrichment = await enrichCameraFromCandidate(row.cameraId, candidate);
      await db
        .update(dpreviewCameraCandidates)
        .set({ status: "matched" })
        .where(eq(dpreviewCameraCandidates.id, row.id));
      return NextResponse.json({
        status: "matched",
        cameraId: row.cameraId,
        enrichedFields: enrichment.fields,
      });
    }

    const pendingEditId = await createPendingCamera(candidate);
    await db
      .update(dpreviewCameraCandidates)
      .set({ status: "pending", pendingEditId, cameraId: null })
      .where(eq(dpreviewCameraCandidates.id, row.id));
    return NextResponse.json({ status: "created", pendingEditId });
  } catch (error) {
    console.error(`[dpreview-camera-review] Error resolving ${dpreviewSlug}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
