import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { dpreviewLensCandidates, lenses, pendingEdits, systems } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  findDuplicate,
  type DpreviewCandidate,
  type ExistingLens,
} from "@/lib/dpreview-import";
import {
  DUPLICATE_CONFIDENCE_THRESHOLD,
  judgeDuplicate,
  type DuplicateVerdict,
} from "@/lib/dpreview-dedupe-llm";
import { createPendingLens, enrichLensFromCandidate, linkLensSystems } from "@/lib/dpreview-pipeline";

export const maxDuration = 300;

const MAX_IMAGES = 4;

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "dpreview.com" ||
    host.endsWith(".dpreview.com") ||
    host === "img-dpreview.com" ||
    host.endsWith(".img-dpreview.com")
  );
}

/**
 * Sync registry rows whose pending edit has since been reviewed:
 * approved → "imported" (resolving the created lens by slug),
 * rejected → "rejected".
 */
async function syncReviewedCandidates(): Promise<void> {
  const rows = await db
    .select({
      id: dpreviewLensCandidates.id,
      editStatus: pendingEdits.status,
      changes: pendingEdits.changes,
      candidateData: dpreviewLensCandidates.candidateData,
    })
    .from(dpreviewLensCandidates)
    .innerJoin(pendingEdits, eq(dpreviewLensCandidates.pendingEditId, pendingEdits.id))
    .where(
      and(
        eq(dpreviewLensCandidates.status, "pending"),
        isNotNull(dpreviewLensCandidates.pendingEditId),
      ),
    );

  let allSystems: { id: number; name: string }[] | null = null;

  for (const row of rows) {
    if (row.editStatus === "rejected") {
      await db
        .update(dpreviewLensCandidates)
        .set({ status: "rejected" })
        .where(eq(dpreviewLensCandidates.id, row.id));
    } else if (row.editStatus === "approved") {
      const slug = (row.changes as Record<string, unknown>).slug;
      let lensId: number | null = null;
      if (typeof slug === "string") {
        const [lens] = await db
          .select({ id: lenses.id })
          .from(lenses)
          .where(eq(lenses.slug, slug))
          .limit(1);
        lensId = lens?.id ?? null;
      }
      // Record mount availability for the freshly approved lens
      if (lensId && row.candidateData) {
        allSystems ??= await db.select({ id: systems.id, name: systems.name }).from(systems);
        await linkLensSystems(lensId, row.candidateData as DpreviewCandidate, allSystems);
      }
      await db
        .update(dpreviewLensCandidates)
        .set({ status: "imported", lensId })
        .where(eq(dpreviewLensCandidates.id, row.id));
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
      dpreviewSlug: dpreviewLensCandidates.dpreviewSlug,
      status: dpreviewLensCandidates.status,
    })
    .from(dpreviewLensCandidates);

  const stats: Record<string, number> = { total: rows.length };
  for (const row of rows) {
    stats[row.status] = (stats[row.status] ?? 0) + 1;
  }

  return NextResponse.json({ seenSlugs: rows.map((r) => r.dpreviewSlug), stats });
}

function validateCandidate(body: unknown): DpreviewCandidate | null {
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
      if (typeof url !== "string" || !isAllowedImageUrl(url)) return null;
      imageUrls.push(url);
    }
  }

  return {
    dpreviewSlug: b.dpreviewSlug.trim(),
    dpreviewUrl: b.dpreviewUrl,
    name: b.name.trim(),
    specTable,
    imageUrls,
    mounts: typeof b.mounts === "string" ? b.mounts : undefined,
    year: typeof b.year === "number" && Number.isFinite(b.year) ? b.year : undefined,
    price: typeof b.price === "string" ? b.price : undefined,
  };
}

/**
 * POST: Receives one scraped DPReview lens candidate.
 *
 * - Genuinely new → images mirrored to R2, queued in pending-edits (entityId 0).
 * - Suspected duplicate → LLM verdict. ≥90% confident duplicate → the existing
 *   lens is enriched with the scraped data. Anything less certain → parked as
 *   "review" for the manual CLI (scraper/dpreview-review-cli.mjs).
 *
 * Body: { dpreviewSlug, dpreviewUrl, name, specTable, imageUrls, mounts?, year?, price? }
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
      .select({ id: dpreviewLensCandidates.id, status: dpreviewLensCandidates.status })
      .from(dpreviewLensCandidates)
      .where(eq(dpreviewLensCandidates.dpreviewSlug, candidate.dpreviewSlug))
      .limit(1);
    if (seen) {
      await db
        .update(dpreviewLensCandidates)
        .set({ lastSeenAt: new Date() })
        .where(eq(dpreviewLensCandidates.id, seen.id));
      return NextResponse.json({ status: "seen", candidateStatus: seen.status });
    }

    const existing: ExistingLens[] = await db
      .select({
        id: lenses.id,
        name: lenses.name,
        slug: lenses.slug,
        yearIntroduced: lenses.yearIntroduced,
      })
      .from(lenses);

    const duplicate = findDuplicate(candidate.name, candidate.year ?? null, existing);

    if (duplicate) {
      const [dbLens] = await db
        .select({
          name: lenses.name,
          brand: lenses.brand,
          yearIntroduced: lenses.yearIntroduced,
          focalLengthMin: lenses.focalLengthMin,
          focalLengthMax: lenses.focalLengthMax,
          apertureMin: lenses.apertureMin,
          weightG: lenses.weightG,
          systemName: systems.name,
        })
        .from(lenses)
        .leftJoin(systems, eq(lenses.systemId, systems.id))
        .where(eq(lenses.id, duplicate.id))
        .limit(1);

      let verdict: DuplicateVerdict | null;
      try {
        verdict = await judgeDuplicate(candidate, dbLens);
      } catch (error) {
        // Never auto-resolve on a failed LLM call — park for manual review
        verdict = null;
        console.warn(`[dpreview-lenses] LLM unavailable for ${candidate.name}: ${String(error)}`);
      }

      if (verdict && verdict.verdict === "duplicate" && verdict.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD) {
        const enrichment = await enrichLensFromCandidate(duplicate.id, candidate);
        await db
          .insert(dpreviewLensCandidates)
          .values({
            dpreviewSlug: candidate.dpreviewSlug,
            dpreviewUrl: candidate.dpreviewUrl,
            name: candidate.name,
            status: "matched",
            lensId: duplicate.id,
            llmVerdict: verdict.verdict,
            llmConfidence: verdict.confidence,
            llmReasoning: verdict.reasoning,
          })
          .onConflictDoNothing();
        console.log(
          `[dpreview-lenses] ${candidate.name}: duplicate of #${duplicate.id} ` +
          `(${Math.round(verdict.confidence * 100)}%), enriched: ${enrichment.fields.join(", ") || "nothing"}`,
        );
        return NextResponse.json({
          status: "matched",
          lensId: duplicate.id,
          enrichedFields: enrichment.fields,
        });
      }

      await db
        .insert(dpreviewLensCandidates)
        .values({
          dpreviewSlug: candidate.dpreviewSlug,
          dpreviewUrl: candidate.dpreviewUrl,
          name: candidate.name,
          status: "review",
          lensId: duplicate.id,
          candidateData: candidate,
          llmVerdict: verdict?.verdict ?? null,
          llmConfidence: verdict?.confidence ?? null,
          llmReasoning: verdict?.reasoning ?? "LLM unavailable — judged manually",
        })
        .onConflictDoNothing();
      console.log(
        `[dpreview-lenses] ${candidate.name}: possible ${verdict?.verdict ?? "?"} vs #${duplicate.id} ` +
        `(${verdict ? Math.round(verdict.confidence * 100) + "%" : "no verdict"}) — parked for manual review`,
      );
      return NextResponse.json({ status: "review", lensId: duplicate.id });
    }

    const pendingEditId = await createPendingLens(candidate);

    await db
      .insert(dpreviewLensCandidates)
      .values({
        dpreviewSlug: candidate.dpreviewSlug,
        dpreviewUrl: candidate.dpreviewUrl,
        name: candidate.name,
        status: "pending",
        pendingEditId,
        // Kept so mount junction rows can be added when the edit is approved
        candidateData: candidate,
      })
      .onConflictDoNothing();

    console.log(`[dpreview-lenses] ${candidate.name}: queued as pending edit #${pendingEditId}`);
    return NextResponse.json({ status: "created", pendingEditId });
  } catch (error) {
    console.error(`[dpreview-lenses] Error processing ${candidate.name}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
