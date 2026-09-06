import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { cameras, dpreviewCameraCandidates, pendingEdits, systems } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { isAllowedDpreviewImageUrl } from "@/lib/dpreview-import";
import {
  candidateYear,
  findDuplicateCamera,
  parseMegapixels,
  type DpreviewCameraCandidate,
  type ExistingCamera,
} from "@/lib/dpreview-camera-import";
import {
  CAMERA_DUPLICATE_CONFIDENCE_THRESHOLD,
  judgeCameraDuplicate,
  type CameraDuplicateVerdict,
} from "@/lib/dpreview-camera-dedupe-llm";
import { createPendingCamera, enrichCameraFromCandidate } from "@/lib/dpreview-camera-pipeline";

export const maxDuration = 300;

const MAX_IMAGES = 4;

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

/**
 * Sync registry rows whose pending edit has since been reviewed:
 * approved → "imported" (resolving the created camera by slug),
 * rejected → "rejected".
 *
 * Simpler than the lens equivalent, which also has mount junction rows to
 * write on approval; a camera's mount is the scalar cameras.system_id, set
 * when the edit is applied.
 */
async function syncReviewedCandidates(): Promise<void> {
  const rows = await db
    .select({
      id: dpreviewCameraCandidates.id,
      editStatus: pendingEdits.status,
      changes: pendingEdits.changes,
    })
    .from(dpreviewCameraCandidates)
    .innerJoin(pendingEdits, eq(dpreviewCameraCandidates.pendingEditId, pendingEdits.id))
    .where(
      and(
        eq(dpreviewCameraCandidates.status, "pending"),
        isNotNull(dpreviewCameraCandidates.pendingEditId),
      ),
    );

  for (const row of rows) {
    if (row.editStatus === "rejected") {
      await db
        .update(dpreviewCameraCandidates)
        .set({ status: "rejected" })
        .where(eq(dpreviewCameraCandidates.id, row.id));
    } else if (row.editStatus === "approved") {
      const slug = (row.changes as Record<string, unknown>).slug;
      let cameraId: number | null = null;
      if (typeof slug === "string") {
        const [camera] = await db
          .select({ id: cameras.id })
          .from(cameras)
          .where(eq(cameras.slug, slug))
          .limit(1);
        cameraId = camera?.id ?? null;
      }
      await db
        .update(dpreviewCameraCandidates)
        .set({ status: "imported", cameraId })
        .where(eq(dpreviewCameraCandidates.id, row.id));
    }
  }
}

/**
 * GET: Returns every DPReview slug already processed, so the GitHub Action
 * knows which product pages to skip. Also lazily syncs review outcomes.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncReviewedCandidates();

  const rows = await db
    .select({
      dpreviewSlug: dpreviewCameraCandidates.dpreviewSlug,
      status: dpreviewCameraCandidates.status,
    })
    .from(dpreviewCameraCandidates);

  const stats: Record<string, number> = { total: rows.length };
  for (const row of rows) {
    stats[row.status] = (stats[row.status] ?? 0) + 1;
  }

  return NextResponse.json({ seenSlugs: rows.map((r) => r.dpreviewSlug), stats });
}

function validateCandidate(body: unknown): DpreviewCameraCandidate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.dpreviewSlug !== "string" || !b.dpreviewSlug.trim()) return null;
  if (typeof b.dpreviewUrl !== "string" || !/^https:\/\/(www\.)?dpreview\.com\//.test(b.dpreviewUrl)) return null;
  if (typeof b.name !== "string" || b.name.trim().length < 2 || b.name.length > 200) return null;

  const specTable: Record<string, string> = {};
  if (b.specTable !== undefined) {
    if (typeof b.specTable !== "object" || b.specTable === null) return null;
    for (const [key, value] of Object.entries(b.specTable)) {
      if (typeof value !== "string" || key.length > 100 || value.length > 500) return null;
      specTable[key] = value;
    }
  }

  const imageUrls: string[] = [];
  if (b.imageUrls !== undefined) {
    if (!Array.isArray(b.imageUrls)) return null;
    for (const url of b.imageUrls.slice(0, MAX_IMAGES)) {
      if (typeof url !== "string" || !isAllowedDpreviewImageUrl(url)) return null;
      imageUrls.push(url);
    }
  }

  return {
    dpreviewSlug: b.dpreviewSlug.trim(),
    dpreviewUrl: b.dpreviewUrl,
    name: b.name.trim(),
    specTable,
    imageUrls,
    year: typeof b.year === "number" && Number.isFinite(b.year) ? b.year : undefined,
    price: typeof b.price === "string" ? b.price : undefined,
  };
}

/**
 * POST: Receives one scraped DPReview camera candidate.
 *
 * - Genuinely new → images mirrored to R2, queued in pending-edits (entityId 0).
 * - Suspected duplicate → LLM verdict. ≥90% confident duplicate → the existing
 *   camera is enriched with the scraped data. Anything less certain → parked as
 *   "review" for the manual CLI (ENTITY=cameras scraper/dpreview-review-cli.mjs).
 *
 * Body: { dpreviewSlug, dpreviewUrl, name, specTable, imageUrls, year?, price? }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = validateCandidate(await request.json().catch(() => null));
  if (!candidate) {
    return NextResponse.json({ error: "Invalid candidate payload" }, { status: 400 });
  }

  try {
    // Idempotency: a slug we've processed before (any status) is never redone
    const [seen] = await db
      .select({ id: dpreviewCameraCandidates.id, status: dpreviewCameraCandidates.status })
      .from(dpreviewCameraCandidates)
      .where(eq(dpreviewCameraCandidates.dpreviewSlug, candidate.dpreviewSlug))
      .limit(1);
    if (seen) {
      await db
        .update(dpreviewCameraCandidates)
        .set({ lastSeenAt: new Date() })
        .where(eq(dpreviewCameraCandidates.id, seen.id));
      return NextResponse.json({ status: "seen", candidateStatus: seen.status });
    }

    const existing: ExistingCamera[] = await db
      .select({
        id: cameras.id,
        name: cameras.name,
        slug: cameras.slug,
        yearIntroduced: cameras.yearIntroduced,
        megapixels: cameras.megapixels,
      })
      .from(cameras);

    const duplicate = findDuplicateCamera(
      candidate.name,
      candidateYear(candidate),
      parseMegapixels(candidate.specTable["Effective pixels"]),
      existing,
    );

    if (duplicate) {
      const [dbCamera] = await db
        .select({
          name: cameras.name,
          yearIntroduced: cameras.yearIntroduced,
          sensorType: cameras.sensorType,
          sensorSize: cameras.sensorSize,
          megapixels: cameras.megapixels,
          bodyType: cameras.bodyType,
          weightG: cameras.weightG,
          systemName: systems.name,
        })
        .from(cameras)
        .leftJoin(systems, eq(cameras.systemId, systems.id))
        .where(eq(cameras.id, duplicate.id))
        .limit(1);

      let verdict: CameraDuplicateVerdict | null;
      try {
        verdict = await judgeCameraDuplicate(candidate, dbCamera);
      } catch (error) {
        // Never auto-resolve on a failed LLM call — park for manual review
        verdict = null;
        console.warn(`[dpreview-cameras] LLM unavailable for ${candidate.name}: ${String(error)}`);
      }

      if (
        verdict &&
        verdict.verdict === "duplicate" &&
        verdict.confidence >= CAMERA_DUPLICATE_CONFIDENCE_THRESHOLD
      ) {
        const enrichment = await enrichCameraFromCandidate(duplicate.id, candidate);
        await db
          .insert(dpreviewCameraCandidates)
          .values({
            dpreviewSlug: candidate.dpreviewSlug,
            dpreviewUrl: candidate.dpreviewUrl,
            name: candidate.name,
            status: "matched",
            cameraId: duplicate.id,
            llmVerdict: verdict.verdict,
            llmConfidence: verdict.confidence,
            llmReasoning: verdict.reasoning,
          })
          .onConflictDoNothing();
        console.log(
          `[dpreview-cameras] ${candidate.name}: duplicate of #${duplicate.id} ` +
            `(${Math.round(verdict.confidence * 100)}%), enriched: ${enrichment.fields.join(", ") || "nothing"}`,
        );
        return NextResponse.json({
          status: "matched",
          cameraId: duplicate.id,
          enrichedFields: enrichment.fields,
        });
      }

      await db
        .insert(dpreviewCameraCandidates)
        .values({
          dpreviewSlug: candidate.dpreviewSlug,
          dpreviewUrl: candidate.dpreviewUrl,
          name: candidate.name,
          status: "review",
          cameraId: duplicate.id,
          candidateData: candidate,
          llmVerdict: verdict?.verdict ?? null,
          llmConfidence: verdict?.confidence ?? null,
          llmReasoning: verdict?.reasoning ?? "LLM unavailable — judged manually",
        })
        .onConflictDoNothing();
      console.log(
        `[dpreview-cameras] ${candidate.name}: possible ${verdict?.verdict ?? "?"} vs #${duplicate.id} ` +
          `(${verdict ? Math.round(verdict.confidence * 100) + "%" : "no verdict"}) — parked for manual review`,
      );
      return NextResponse.json({ status: "review", cameraId: duplicate.id });
    }

    const pendingEditId = await createPendingCamera(candidate);

    await db
      .insert(dpreviewCameraCandidates)
      .values({
        dpreviewSlug: candidate.dpreviewSlug,
        dpreviewUrl: candidate.dpreviewUrl,
        name: candidate.name,
        status: "pending",
        pendingEditId,
        // The raw scrape, kept so a queued body can still be checked against
        // what DPReview actually said after the product page has changed.
        candidateData: candidate,
      })
      .onConflictDoNothing();

    console.log(`[dpreview-cameras] ${candidate.name}: queued as pending edit #${pendingEditId}`);
    return NextResponse.json({ status: "created", pendingEditId });
  } catch (error) {
    console.error(`[dpreview-cameras] Error processing ${candidate.name}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
