import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { dpreviewLensCandidates, lenses, pendingEdits, users } from "@/db/schema";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { auditLensSpecs, type SpecAudit } from "@/lib/dpreview-audit-llm";
import { DPREVIEW_BOT_EMAIL } from "@/lib/dpreview-import";
import { getBotUserId } from "@/lib/dpreview-pipeline";

export const maxDuration = 300;

// Columns the extraction pipeline derives from the raw spec table / name
const AUDITED_COLUMNS = [
  "lensType",
  "focalLengthMin",
  "focalLengthMax",
  "apertureMin",
  "apertureMax",
  "weightG",
  "filterSizeMm",
  "minFocusDistanceM",
  "maxMagnification",
  "lensElements",
  "lensGroups",
  "diaphragmBlades",
  "yearIntroduced",
  "isZoom",
  "isPrime",
  "isMacro",
  "hasAutofocus",
  "hasStabilization",
  "coverage",
] as const;

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

const NUMERIC_FIELDS = new Set([
  "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
  "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
  "lensElements", "lensGroups", "diaphragmBlades", "yearIntroduced",
]);
const BOOLEAN_FIELDS = new Set([
  "isZoom", "isPrime", "isMacro", "hasAutofocus", "hasStabilization",
]);
const TEXT_FIELDS = new Set(["lensType", "coverage"]);

/** Coerce an LLM-suggested string into a typed column value; null = unusable. */
function coerceSuggestion(field: string, raw: string): unknown {
  const value = raw.trim();
  if (!value) return null;
  if (NUMERIC_FIELDS.has(field)) {
    const n = parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    if (/^(true|yes)$/i.test(value)) return true;
    if (/^(false|no)$/i.test(value)) return false;
    return null;
  }
  if (TEXT_FIELDS.has(field)) return value;
  return null;
}

const AUDIT_SUMMARY_PREFIX = "LLM spec audit:";

/**
 * Deterministic noise filter over LLM flags: notation/rounding disagreements
 * and equivalent values are dropped so only substantive corrections are filed.
 * `current` is the lens row (or a pending edit's mapped columns).
 */
function isNoiseIssue(
  issue: { field: string; suggestedValue: string },
  current: Record<string, unknown>,
): boolean {
  const field = issue.field;
  const suggested = issue.suggestedValue?.trim() ?? "";
  if (NUMERIC_FIELDS.has(field)) {
    const s = parseFloat(suggested.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(s)) return true; // no usable correction
    const cur = current[field];
    if (typeof cur === "number") {
      if (s === cur) return true; // "F/2" vs 2 — same value, different notation
      const rel = Math.abs(s - cur) / Math.max(Math.abs(cur), 1e-9);
      if (rel < 0.05) return true; // rounding disagreement
    }
    // Suggested apertureMax equal to the brightest aperture = the classic
    // notation confusion, never a real minimum-aperture datum
    if (field === "apertureMax" && typeof current.apertureMin === "number" && s === current.apertureMin) {
      return true;
    }
    return false;
  }
  if (field === "lensType" && typeof current.lensType === "string" && suggested) {
    const a = current.lensType.toLowerCase();
    const b = suggested.toLowerCase();
    if (a.includes(b) || b.includes(a)) return true; // one is a refinement of the other
  }
  return false;
}

async function watcherLensIds(recentCutoff?: Date): Promise<number[]> {
  const rows = await db
    .selectDistinct({ lensId: dpreviewLensCandidates.lensId })
    .from(dpreviewLensCandidates)
    .where(
      and(
        isNotNull(dpreviewLensCandidates.lensId),
        // "review" candidates only *suspect* their lensId — audit only lenses
        // the watcher actually enriched or imported
        inArray(dpreviewLensCandidates.status, ["matched", "imported"]),
        ...(recentCutoff
          ? [sql`${dpreviewLensCandidates.firstSeenAt} > ${recentCutoff}`]
          : []),
      ),
    );
  return rows.map((r) => r.lensId!).sort((a, b) => a - b);
}

/**
 * GET: how much there is to audit.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [lensIds, [bot]] = await Promise.all([
    watcherLensIds(),
    db.select({ id: users.id }).from(users).where(eq(users.email, DPREVIEW_BOT_EMAIL)).limit(1),
  ]);

  let pendingCount = 0;
  if (bot) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(pendingEdits)
      .where(
        and(
          eq(pendingEdits.userId, bot.id),
          eq(pendingEdits.status, "pending"),
          eq(pendingEdits.entityId, 0),
        ),
      );
    pendingCount = Number(row.n);
  }

  return NextResponse.json({ lenses: lensIds.length, pendingEdits: pendingCount });
}

/**
 * POST: audit one batch. Stateless — the caller pages through.
 *
 * Body: { target: "lenses" | "pending", afterId?: number, limit?: number }
 * Returns { items: [{ id, name, ok, issues }], lastId: number | null }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    target?: unknown;
    afterId?: unknown;
    limit?: unknown;
    createEdits?: unknown;
    recentHours?: unknown;
  } | null;
  const target = body?.target === "lenses" || body?.target === "pending" ? body.target : null;
  if (!target) {
    return NextResponse.json({ error: "target ('lenses' | 'pending') required" }, { status: 400 });
  }
  const afterId = typeof body?.afterId === "number" ? body.afterId : 0;
  const limit = Math.min(Math.max(typeof body?.limit === "number" ? body.limit : 10, 1), 25);
  const createEdits = body?.createEdits === true;
  // Scope to candidates first seen (or edits created) in the last N hours —
  // keeps the weekly scheduled audit from re-auditing the whole catalog
  const recentHours = typeof body?.recentHours === "number" && body.recentHours > 0 ? body.recentHours : null;
  const recentCutoff = recentHours ? new Date(Date.now() - recentHours * 3600_000) : undefined;

  try {
    const items: { id: number; name: string; audit: SpecAudit }[] = [];
    let lastId: number | null = null;
    let botUserId: number | null = null;

    if (target === "lenses") {
      const ids = (await watcherLensIds(recentCutoff)).filter((id) => id > afterId).slice(0, limit);
      if (ids.length > 0) {
        const rows = await db
          .select()
          .from(lenses)
          .where(inArray(lenses.id, ids))
          .orderBy(asc(lenses.id));
        for (const lens of rows) {
          const rawSpecs = (lens.specs ?? {}) as Record<string, unknown>;
          if (Object.keys(rawSpecs).length === 0) continue; // nothing to audit against
          const columns: Record<string, unknown> = {};
          for (const col of AUDITED_COLUMNS) columns[col] = lens[col];
          const audit = await auditLensSpecs(lens.name, rawSpecs, columns);
          items.push({ id: lens.id, name: lens.name, audit });

          // File the flagged discrepancies as a correction pending edit so
          // they surface in the same admin review queue (noise pruned first)
          const meaningfulIssues = audit.issues.filter((i) => !isNoiseIssue(i, lens));
          if (createEdits && !audit.ok && meaningfulIssues.length > 0) {
            const corrections: Record<string, unknown> = {};
            for (const issue of meaningfulIssues) {
              const coerced = coerceSuggestion(issue.field, issue.suggestedValue);
              if (coerced !== null) corrections[issue.field] = coerced;
            }
            if (Object.keys(corrections).length > 0) {
              const [existingEdit] = await db
                .select({ id: pendingEdits.id })
                .from(pendingEdits)
                .where(
                  and(
                    eq(pendingEdits.entityType, "lens"),
                    eq(pendingEdits.entityId, lens.id),
                    eq(pendingEdits.status, "pending"),
                    sql`${pendingEdits.summary} LIKE ${AUDIT_SUMMARY_PREFIX + "%"}`,
                  ),
                )
                .limit(1);
              if (!existingEdit) {
                const issueText = meaningfulIssues
                  .map((i) => `${i.field} (raw "${i.rawValue}" vs "${i.extractedValue}")`)
                  .join("; ");
                await db.insert(pendingEdits).values({
                  entityType: "lens",
                  entityId: lens.id,
                  changes: { ...corrections, _audit: meaningfulIssues },
                  summary: `${AUDIT_SUMMARY_PREFIX} ${issueText}`.slice(0, 500),
                  userId: (botUserId ??= await getBotUserId()),
                });
              }
            }
          }
        }
        lastId = ids[ids.length - 1];
      }
    } else {
      const [bot] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, DPREVIEW_BOT_EMAIL))
        .limit(1);
      if (bot) {
        const rows = await db
          .select({ id: pendingEdits.id, changes: pendingEdits.changes })
          .from(pendingEdits)
          .where(
            and(
              eq(pendingEdits.userId, bot.id),
              eq(pendingEdits.status, "pending"),
              eq(pendingEdits.entityId, 0),
              gt(pendingEdits.id, afterId),
              ...(recentCutoff ? [sql`${pendingEdits.createdAt} > ${recentCutoff}`] : []),
            ),
          )
          .orderBy(asc(pendingEdits.id))
          .limit(limit);
        for (const row of rows) {
          const changes = row.changes as Record<string, unknown>;
          const rawSpecs = (changes.specs ?? {}) as Record<string, unknown>;
          if (Object.keys(rawSpecs).length === 0) continue;
          const columns: Record<string, unknown> = {};
          for (const col of AUDITED_COLUMNS) columns[col] = changes[col] ?? null;
          const name = String(changes.name ?? `pending edit #${row.id}`);
          const audit = await auditLensSpecs(name, rawSpecs, columns);
          items.push({ id: row.id, name, audit });

          // Annotate the pending edit itself so the reviewer sees the warning;
          // "_audit" is display-only and stripped by the approval allowlist
          if (createEdits) {
            const nextChanges =
              !audit.ok && audit.issues.length > 0
                ? { ...changes, _audit: audit.issues }
                : (() => {
                    const { _audit: _drop, ...rest } = changes;
                    return rest;
                  })();
            await db
              .update(pendingEdits)
              .set({ changes: nextChanges })
              .where(eq(pendingEdits.id, row.id));
          }
        }
        if (rows.length > 0) lastId = rows[rows.length - 1].id;
      }
    }

    return NextResponse.json({
      items: items.map((i) => ({ id: i.id, name: i.name, ok: i.audit.ok, issues: i.audit.issues })),
      lastId,
    });
  } catch (error) {
    console.error("[dpreview-audit] Error:", error);
    return NextResponse.json(
      { error: "Audit failed", details: String(error) },
      { status: 500 },
    );
  }
}
