import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  pendingEdits,
  lenses,
  cameras,
  systems,
  collections,
  lensSeries,
} from "@/db/schema";
import { createRevision, type EntityType } from "@/lib/revisions";
import { sendEditApprovedEmail, sendEditRejectedEmail } from "@/lib/email";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

export const pathPrefixes: Record<string, string> = {
  lens: "/lenses",
  camera: "/cameras",
  system: "/systems",
  collection: "/collections",
  series: "/lenses/series",
};

/**
 * Tell the author what happened to their edit.
 *
 * Before this, a first edit vanished into a queue the author could not see
 * and nothing ever came back. Failure here is logged and swallowed: a review
 * that succeeded must not be reported as failed because an email bounced.
 * The reviewer reviewing their own edit gets nothing.
 */
export async function notifyEditReviewed(
  edit: typeof pendingEdits.$inferSelect,
  outcome: { status: "approved"; entityId: number } | { status: "rejected"; reason: string | null },
  reviewerId: number,
): Promise<void> {
  if (edit.userId === reviewerId) return;
  try {
    const [author] = await db
      .select({ email: users.email, displayName: users.displayName, isBanned: users.isBanned })
      .from(users)
      .where(eq(users.id, edit.userId))
      .limit(1);
    if (!author || author.isBanned) return;

    const entityType = edit.entityType as EntityType;
    const table = entityTables[entityType];
    const entityId = outcome.status === "approved" ? outcome.entityId : edit.entityId;
    let entityName = "a record";
    let entityPath = pathPrefixes[entityType] ?? "/";
    if (table && entityId > 0) {
      const [entity] = await db
        .select({ name: table.name, slug: table.slug })
        .from(table)
        .where(eq(table.id, entityId))
        .limit(1);
      if (entity) {
        entityName = entity.name;
        entityPath = `${pathPrefixes[entityType]}/${entity.slug}`;
      }
    } else if (entityId === 0) {
      const proposed = (edit.changes as Record<string, unknown>).name;
      if (typeof proposed === "string" && proposed) entityName = proposed;
    }

    const base = {
      to: author.email,
      displayName: author.displayName,
      entityName,
      entityPath,
      entityType,
      entityId,
      summary: edit.summary,
    };
    if (outcome.status === "approved") {
      await sendEditApprovedEmail(base);
    } else {
      await sendEditRejectedEmail({ ...base, reason: outcome.reason });
    }
  } catch (err) {
    console.error(
      `[pending-edits] Failed to notify author of edit ${edit.id} (${outcome.status}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

export type ApprovalResult =
  | { ok: true; entityId: number }
  | {
      ok: false;
      reason: "no_valid_changes" | "missing_name" | "entity_missing" | "stale_system";
    };

/**
 * Apply one pending edit (the "approve" action): re-validates the changes
 * against the field allowlist, creates or updates the entity, writes the
 * revision, marks the edit approved, and revalidates the public page.
 *
 * On "entity_missing" the edit is auto-rejected before returning.
 * Shared by the single-edit route and the bulk approve-all endpoint.
 */
export async function applyPendingEditApproval(
  edit: typeof pendingEdits.$inferSelect,
  adminId: number,
): Promise<ApprovalResult> {
  const entityType = edit.entityType as EntityType;
  const table = entityTables[entityType];
  const rawChanges = edit.changes as Record<string, unknown>;

  // Re-validate changes against the allowed field list (defense in depth)
  const allowedFields: Record<string, string[]> = {
    lens: [
      "name", "url", "brand", "description", "lensType", "era", "productionStatus",
      "systemId",
      "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
      "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
      "lensElements", "lensGroups", "diaphragmBlades",
      "yearIntroduced", "yearDiscontinued",
      "isZoom", "isMacro", "isPrime", "hasStabilization", "hasAutofocus",
      "coverage",
    ],
    camera: [
      "name", "url", "description", "alias",
      "systemId",
      "sensorType", "sensorSize", "megapixels", "resolution",
      "yearIntroduced", "bodyType", "weightG",
    ],
    system: ["name", "manufacturer", "mountType", "description"],
    collection: ["name", "description"],
    series: ["name", "description"],
  };
  const allowed = new Set(allowedFields[entityType] ?? []);
  const changes: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawChanges)) {
    if (allowed.has(key)) changes[key] = val;
  }

  if (Object.keys(changes).length === 0) {
    return { ok: false, reason: "no_valid_changes" };
  }

  const isNewEntity = edit.entityId === 0;

  // Also allow "slug" for new entity creation only — never on updates
  if (isNewEntity && rawChanges.slug) changes.slug = rawChanges.slug;

  // New lens and camera creations may also carry scraped specs and R2-hosted
  // images. Only the submissions API (whose field whitelist excludes these)
  // and the CRON_SECRET-protected DPReview watcher write entityId=0 edits;
  // the shape and R2-host checks below are defense in depth.
  if (isNewEntity && (entityType === "lens" || entityType === "camera")) {
    const specs = rawChanges.specs;
    if (
      specs &&
      typeof specs === "object" &&
      !Array.isArray(specs) &&
      Object.values(specs).every((v) => typeof v === "string")
    ) {
      changes.specs = specs;
    }

    const images = rawChanges.images;
    const r2Public = process.env.R2_PUBLIC_URL;
    if (
      r2Public &&
      Array.isArray(images) &&
      images.length > 0 &&
      images.every((img) => {
        if (!img || typeof img !== "object") return false;
        const { src, alt } = img as { src?: unknown; alt?: unknown };
        return (
          typeof src === "string" &&
          src.startsWith(`${r2Public}/`) &&
          typeof alt === "string"
        );
      })
    ) {
      changes.images = images;
    }
  }

  let targetEntityId: number;

  if (isNewEntity) {
    // Create a new entity
    if (!changes.name) {
      return { ok: false, reason: "missing_name" };
    }

    /*
     * A mount that has since been merged away.
     *
     * Edits queued before a mount consolidation still name the id they were
     * written with, and the trigger that mirrors lenses.system_id into
     * lens_systems fails its foreign key on insert. That surfaced as "failed
     * query: insert into lenses", which points at the wrong table and gives an
     * admin nothing to act on.
     */
    if (typeof changes.systemId === "number") {
      const [system] = await db
        .select({ id: systems.id })
        .from(systems)
        .where(eq(systems.id, changes.systemId))
        .limit(1);
      if (!system) return { ok: false, reason: "stale_system" };
    }

    const insertData: Record<string, unknown> = { ...changes };
    // Ensure required defaults
    if (entityType === "lens") {
      insertData.specs = insertData.specs ?? {};
      insertData.images = insertData.images ?? [];
      insertData.isZoom = insertData.isZoom ?? false;
      insertData.isMacro = insertData.isMacro ?? false;
      insertData.isPrime = insertData.isPrime ?? false;
      insertData.hasStabilization = insertData.hasStabilization ?? false;
      insertData.hasAutofocus = insertData.hasAutofocus ?? false;
    } else if (entityType === "camera") {
      insertData.specs = insertData.specs ?? {};
      insertData.images = insertData.images ?? [];
    }

    const [created] = await db
      .insert(table)
      .values(insertData as never)
      .returning({ id: table.id });
    targetEntityId = created.id;
  } else {
    // Verify entity still exists
    const [entity] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, edit.entityId))
      .limit(1);

    if (!entity) {
      // Entity was deleted since the edit was submitted — auto-reject
      await db
        .update(pendingEdits)
        .set({
          status: "rejected",
          reviewedByUserId: adminId,
          reviewedAt: new Date(),
          rejectReason: "Entity no longer exists",
        })
        .where(eq(pendingEdits.id, edit.id));
      return { ok: false, reason: "entity_missing" };
    }

    // Apply the update
    await db.update(table).set(changes).where(eq(table.id, edit.entityId));
    targetEntityId = edit.entityId;
  }

  // Create revision attributed to the original submitter
  await createRevision({
    entityType,
    entityId: targetEntityId,
    summary: edit.summary,
    userId: edit.userId,
    ipHash: edit.ipHash,
    autoPatrol: true, // Admin-approved edits are auto-patrolled
  });

  // Mark as approved
  await db
    .update(pendingEdits)
    .set({
      status: "approved",
      reviewedByUserId: adminId,
      reviewedAt: new Date(),
    })
    .where(eq(pendingEdits.id, edit.id));

  // Revalidate the public page for this entity
  const [entity] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(eq(table.id, targetEntityId))
    .limit(1);

  if (entity) {
    revalidatePath(`${pathPrefixes[entityType]}/${entity.slug}`);
    if (entityType === "lens") {
      revalidateTag("lenses", "max");
    }
  }

  return { ok: true, entityId: targetEntityId };
}
