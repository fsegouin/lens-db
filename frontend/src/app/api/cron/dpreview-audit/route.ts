import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import {
  cameras,
  dpreviewCameraCandidates,
  dpreviewLensCandidates,
  lenses,
  pendingEdits,
  users,
} from "@/db/schema";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { auditCameraSpecs, auditLensSpecs, type SpecAudit } from "@/lib/dpreview-audit-llm";
import { DPREVIEW_BOT_EMAIL } from "@/lib/dpreview-import";
import { getBotUserId } from "@/lib/dpreview-pipeline";

export const maxDuration = 300;

type EntityKind = "lens" | "camera";

// Columns the extraction pipeline derives from the raw spec table / name
const LENS_AUDITED_COLUMNS = [
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

const CAMERA_AUDITED_COLUMNS = [
  "sensorType",
  "sensorSize",
  "megapixels",
  "resolution",
  "bodyType",
  "weightG",
  "yearIntroduced",
] as const;

/**
 * Per-entity audit rules. The field sets drive both the coercion of an LLM
 * suggestion into a typed column value and the noise filter, so a column
 * appears in exactly one of numeric/boolean/text.
 */
const AUDIT_RULES: Record<
  EntityKind,
  {
    columns: readonly string[];
    numeric: Set<string>;
    boolean: Set<string>;
    text: Set<string>;
    audit: (
      name: string,
      rawSpecs: Record<string, unknown>,
      columns: Record<string, unknown>,
    ) => Promise<SpecAudit>;
  }
> = {
  lens: {
    columns: LENS_AUDITED_COLUMNS,
    numeric: new Set([
      "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
      "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
      "lensElements", "lensGroups", "diaphragmBlades", "yearIntroduced",
    ]),
    boolean: new Set(["isZoom", "isPrime", "isMacro", "hasAutofocus", "hasStabilization"]),
    text: new Set(["lensType", "coverage"]),
    audit: auditLensSpecs,
  },
  camera: {
    columns: CAMERA_AUDITED_COLUMNS,
    numeric: new Set(["megapixels", "weightG", "yearIntroduced"]),
    boolean: new Set<string>(),
    // resolution and sensorSize are stored in a normalized form the raw table
    // does not use; the audit prompt is told so, and isNoiseIssue keeps a
    // reformatting disagreement from ever being filed as a correction.
    text: new Set(["sensorType", "sensorSize", "bodyType", "resolution"]),
    audit: auditCameraSpecs,
  },
};

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

/** Coerce an LLM-suggested string into a typed column value; null = unusable. */
function coerceSuggestion(kind: EntityKind, field: string, raw: string): unknown {
  const rules = AUDIT_RULES[kind];
  const value = raw.trim();
  if (!value) return null;
  if (rules.numeric.has(field)) {
    const n = parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (rules.boolean.has(field)) {
    if (/^(true|yes)$/i.test(value)) return true;
    if (/^(false|no)$/i.test(value)) return false;
    return null;
  }
  if (rules.text.has(field)) return value;
  return null;
}

const AUDIT_SUMMARY_PREFIX = "LLM spec audit:";

/**
 * Deterministic noise filter over LLM flags: notation/rounding disagreements
 * and equivalent values are dropped so only substantive corrections are filed.
 * `current` is the entity row (or a pending edit's mapped columns).
 */
function isNoiseIssue(
  kind: EntityKind,
  issue: { field: string; suggestedValue: string },
  current: Record<string, unknown>,
): boolean {
  const rules = AUDIT_RULES[kind];
  const field = issue.field;
  const suggested = issue.suggestedValue?.trim() ?? "";
  if (rules.numeric.has(field)) {
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
  if (kind === "camera") {
    // Both columns are deliberately not the table's own wording: sensorSize is
    // a format name derived from millimetre dimensions, resolution is
    // reformatted with an appended megapixel count. A suggestion that merely
    // restates the raw table is the extraction working, not a defect.
    if (field === "sensorSize" && /\d\s*[×x]\s*\d/.test(suggested)) return true;
    if (field === "resolution" && typeof current.resolution === "string") {
      const digits = (v: string) => v.replace(/[^\d]/g, "");
      if (digits(suggested) && current.resolution.replace(/[^\d]/g, "").startsWith(digits(suggested))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Entities the watcher actually created or enriched. "review" candidates only
 * *suspect* their entity id, so they are excluded.
 */
async function watcherEntityIds(kind: EntityKind, recentCutoff?: Date): Promise<number[]> {
  if (kind === "lens") {
    const rows = await db
      .selectDistinct({ entityId: dpreviewLensCandidates.lensId })
      .from(dpreviewLensCandidates)
      .where(
        and(
          isNotNull(dpreviewLensCandidates.lensId),
          inArray(dpreviewLensCandidates.status, ["matched", "imported"]),
          ...(recentCutoff
            ? [sql`${dpreviewLensCandidates.firstSeenAt} > ${recentCutoff}`]
            : []),
        ),
      );
    return rows.map((r) => r.entityId!).sort((a, b) => a - b);
  }
  const rows = await db
    .selectDistinct({ entityId: dpreviewCameraCandidates.cameraId })
    .from(dpreviewCameraCandidates)
    .where(
      and(
        isNotNull(dpreviewCameraCandidates.cameraId),
        inArray(dpreviewCameraCandidates.status, ["matched", "imported"]),
        ...(recentCutoff
          ? [sql`${dpreviewCameraCandidates.firstSeenAt} > ${recentCutoff}`]
          : []),
      ),
    );
  return rows.map((r) => r.entityId!).sort((a, b) => a - b);
}

async function pendingEditCount(botId: number, entityType: EntityKind): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pendingEdits)
    .where(
      and(
        eq(pendingEdits.userId, botId),
        eq(pendingEdits.status, "pending"),
        eq(pendingEdits.entityId, 0),
        eq(pendingEdits.entityType, entityType),
      ),
    );
  return Number(row.n);
}

/**
 * GET: how much there is to audit.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [lensIds, cameraIds, [bot]] = await Promise.all([
    watcherEntityIds("lens"),
    watcherEntityIds("camera"),
    db.select({ id: users.id }).from(users).where(eq(users.email, DPREVIEW_BOT_EMAIL)).limit(1),
  ]);

  const pendingLenses = bot ? await pendingEditCount(bot.id, "lens") : 0;
  const pendingCameras = bot ? await pendingEditCount(bot.id, "camera") : 0;

  return NextResponse.json({
    lenses: lensIds.length,
    cameras: cameraIds.length,
    // `pendingEdits` keeps its original meaning (lens edits) so the existing
    // CLI output is unchanged; pendingCameras is additive.
    pendingEdits: pendingLenses,
    pendingCameras,
  });
}

const TARGETS = {
  lenses: { kind: "lens" as const, pending: false },
  cameras: { kind: "camera" as const, pending: false },
  pending: { kind: "lens" as const, pending: true },
  "pending-cameras": { kind: "camera" as const, pending: true },
};

/**
 * POST: audit one batch. Stateless — the caller pages through.
 *
 * Body: { target: "lenses" | "cameras" | "pending" | "pending-cameras",
 *         afterId?: number, limit?: number }
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
  const targetKey =
    typeof body?.target === "string" && body.target in TARGETS
      ? (body.target as keyof typeof TARGETS)
      : null;
  if (!targetKey) {
    return NextResponse.json(
      { error: "target ('lenses' | 'cameras' | 'pending' | 'pending-cameras') required" },
      { status: 400 },
    );
  }
  const { kind, pending: isPendingTarget } = TARGETS[targetKey];
  const rules = AUDIT_RULES[kind];

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

    if (!isPendingTarget) {
      const ids = (await watcherEntityIds(kind, recentCutoff))
        .filter((id) => id > afterId)
        .slice(0, limit);
      if (ids.length > 0) {
        const rows =
          kind === "lens"
            ? await db.select().from(lenses).where(inArray(lenses.id, ids)).orderBy(asc(lenses.id))
            : await db.select().from(cameras).where(inArray(cameras.id, ids)).orderBy(asc(cameras.id));

        for (const row of rows) {
          const entity = row as unknown as Record<string, unknown>;
          const rawSpecs = (entity.specs ?? {}) as Record<string, unknown>;
          if (Object.keys(rawSpecs).length === 0) continue; // nothing to audit against
          const columns: Record<string, unknown> = {};
          for (const col of rules.columns) columns[col] = entity[col];
          const name = String(entity.name);
          const entityId = Number(entity.id);
          const audit = await rules.audit(name, rawSpecs, columns);
          items.push({ id: entityId, name, audit });

          // File the flagged discrepancies as a correction pending edit so
          // they surface in the same admin review queue (noise pruned first)
          const meaningfulIssues = audit.issues.filter((i) => !isNoiseIssue(kind, i, entity));
          if (createEdits && !audit.ok && meaningfulIssues.length > 0) {
            const corrections: Record<string, unknown> = {};
            for (const issue of meaningfulIssues) {
              const coerced = coerceSuggestion(kind, issue.field, issue.suggestedValue);
              if (coerced !== null) corrections[issue.field] = coerced;
            }
            if (Object.keys(corrections).length > 0) {
              const [existingEdit] = await db
                .select({ id: pendingEdits.id })
                .from(pendingEdits)
                .where(
                  and(
                    eq(pendingEdits.entityType, kind),
                    eq(pendingEdits.entityId, entityId),
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
                  entityType: kind,
                  entityId: entityId,
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
              // Without this the lens auditor would also read the camera
              // watcher's new-body edits, and file lens corrections onto them.
              eq(pendingEdits.entityType, kind),
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
          for (const col of rules.columns) columns[col] = changes[col] ?? null;
          const name = String(changes.name ?? `pending edit #${row.id}`);
          const audit = await rules.audit(name, rawSpecs, columns);
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
