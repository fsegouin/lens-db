import { db } from "@/db";
import {
  revisions,
  lenses,
  cameras,
  systems,
  collections,
  lensSeries,
  users,
} from "@/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

export type EntityType = "lens" | "camera" | "system" | "collection" | "series";

// Maps entity types to their Drizzle table references
const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

// Fields to exclude from revision snapshots (engagement/internal data)
const excludedFields = new Set([
  "viewCount",
  "averageRating",
  "ratingCount",
  "submittedByIp",
]);

/**
 * Snapshot the current state of an entity, excluding engagement fields.
 */
export async function snapshotEntity(
  entityType: EntityType,
  entityId: number
): Promise<Record<string, unknown> | null> {
  const table = entityTables[entityType];
  const [row] = await db
    .select()
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1);
  if (!row) return null;

  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!excludedFields.has(key)) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

/**
 * Compute which fields changed between two snapshots.
 */
export function computeChangedFields(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (excludedFields.has(key)) continue;
    const a = JSON.stringify(oldData[key] ?? null);
    const b = JSON.stringify(newData[key] ?? null);
    if (a !== b) changed.push(key);
  }
  return changed;
}

/**
 * Get the next revision number for an entity.
 */
async function getNextRevisionNumber(
  entityType: EntityType,
  entityId: number
): Promise<number> {
  const [result] = await db
    .select({ maxRev: sql<number>`coalesce(max(${revisions.revisionNumber}), 0)` })
    .from(revisions)
    .where(
      and(
        eq(revisions.entityType, entityType),
        eq(revisions.entityId, entityId)
      )
    );
  return (result?.maxRev ?? 0) + 1;
}

/**
 * Create a new revision after an entity has been updated.
 * Call this AFTER the entity update has been applied.
 */
export async function createRevision({
  entityType,
  entityId,
  summary,
  userId,
  ipHash,
  isRevert = false,
  revertedToRevision,
  autoPatrol = false,
}: {
  entityType: EntityType;
  entityId: number;
  summary: string;
  userId?: number | null;
  ipHash?: string | null;
  isRevert?: boolean;
  revertedToRevision?: number;
  autoPatrol?: boolean;
}): Promise<typeof revisions.$inferSelect> {
  // Snapshot the entity's current (post-update) state
  const data = await snapshotEntity(entityType, entityId);
  if (!data) throw new Error(`Entity ${entityType}:${entityId} not found`);

  const revisionNumber = await getNextRevisionNumber(entityType, entityId);

  // Compute changed fields by comparing to the previous revision
  let changedFields: string[] = [];
  if (revisionNumber > 1) {
    const [prev] = await db
      .select({ data: revisions.data })
      .from(revisions)
      .where(
        and(
          eq(revisions.entityType, entityType),
          eq(revisions.entityId, entityId),
          eq(revisions.revisionNumber, revisionNumber - 1)
        )
      )
      .limit(1);
    if (prev) {
      changedFields = computeChangedFields(
        prev.data as Record<string, unknown>,
        data
      );
    }
  }

  const [revision] = await db
    .insert(revisions)
    .values({
      entityType,
      entityId,
      revisionNumber,
      data,
      summary,
      changedFields,
      userId: userId ?? null,
      ipHash: ipHash ?? null,
      isRevert,
      revertedToRevision: revertedToRevision ?? null,
      isPatrolled: autoPatrol,
    })
    .returning();

  // Increment user's edit count
  if (userId) {
    await db
      .update(users)
      .set({ editCount: sql`${users.editCount} + 1` })
      .where(eq(users.id, userId));
  }

  return revision;
}

/**
 * Get paginated revision history for an entity.
 */
export async function getRevisionHistory(
  entityType: EntityType,
  entityId: number,
  page = 1,
  limit = 50
): Promise<{
  revisions: Array<{
    id: number;
    revisionNumber: number;
    summary: string;
    changedFields: unknown;
    userId: number | null;
    displayName: string | null;
    isRevert: boolean | null;
    isPatrolled: boolean | null;
    createdAt: Date | null;
  }>;
  total: number;
}> {
  const offset = (page - 1) * limit;

  const [items, [totalResult]] = await Promise.all([
    db
      .select({
        id: revisions.id,
        revisionNumber: revisions.revisionNumber,
        summary: revisions.summary,
        changedFields: revisions.changedFields,
        userId: revisions.userId,
        displayName: users.displayName,
        isRevert: revisions.isRevert,
        isPatrolled: revisions.isPatrolled,
        createdAt: revisions.createdAt,
      })
      .from(revisions)
      .leftJoin(users, eq(revisions.userId, users.id))
      .where(
        and(
          eq(revisions.entityType, entityType),
          eq(revisions.entityId, entityId)
        )
      )
      .orderBy(desc(revisions.revisionNumber))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(revisions)
      .where(
        and(
          eq(revisions.entityType, entityType),
          eq(revisions.entityId, entityId)
        )
      ),
  ]);

  return { revisions: items, total: totalResult.total };
}

/**
 * Get a single revision with full data.
 */
export async function getRevision(revisionId: number) {
  const [revision] = await db
    .select({
      id: revisions.id,
      entityType: revisions.entityType,
      entityId: revisions.entityId,
      revisionNumber: revisions.revisionNumber,
      data: revisions.data,
      summary: revisions.summary,
      changedFields: revisions.changedFields,
      userId: revisions.userId,
      displayName: users.displayName,
      isRevert: revisions.isRevert,
      revertedToRevision: revisions.revertedToRevision,
      isPatrolled: revisions.isPatrolled,
      createdAt: revisions.createdAt,
    })
    .from(revisions)
    .leftJoin(users, eq(revisions.userId, users.id))
    .where(eq(revisions.id, revisionId))
    .limit(1);
  return revision ?? null;
}

/**
 * Diff two revisions, returning field-level changes.
 */
export function diffRevisions(
  revisionA: Record<string, unknown>,
  revisionB: Record<string, unknown>
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const diffs: Array<{ field: string; oldValue: unknown; newValue: unknown }> =
    [];
  const allKeys = new Set([
    ...Object.keys(revisionA),
    ...Object.keys(revisionB),
  ]);
  for (const key of allKeys) {
    if (excludedFields.has(key) || key === "id" || key === "createdAt") continue;
    const a = revisionA[key] ?? null;
    const b = revisionB[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push({ field: key, oldValue: a, newValue: b });
    }
  }
  return diffs;
}

/**
 * Revert an entity to a previous revision's state.
 */
export async function revertToRevision(
  revisionId: number,
  userId: number
): Promise<typeof revisions.$inferSelect> {
  const target = await getRevision(revisionId);
  if (!target) throw new Error(`Revision ${revisionId} not found`);

  const entityType = target.entityType as EntityType;
  const table = entityTables[entityType];
  const data = target.data as Record<string, unknown>;

  // Remove fields that shouldn't be written back
  const { id: _id, createdAt: _ca, protectionLevel: _pl, ...updateData } = data;

  await db
    .update(table)
    .set(updateData as Record<string, unknown>)
    .where(eq(table.id, target.entityId));

  return createRevision({
    entityType,
    entityId: target.entityId,
    summary: `Reverted to revision ${target.revisionNumber}`,
    userId,
    isRevert: true,
    revertedToRevision: target.revisionNumber,
    autoPatrol: true,
  });
}
