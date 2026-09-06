import { unstable_cache } from "next/cache";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { revisions, users } from "@/db/schema";

/**
 * The one account whose edits are not a person's work. It files the
 * DPReview imports, and "last edited by DPReview Watcher" would credit a
 * cron job on a thousand pages while hiding the human edit before it.
 */
export const WATCHER_DISPLAY_NAME = "DPReview Watcher";

export type Provenance = {
  revisionCount: number;
  lastEditedAt: Date | null;
  /** The most recent person to edit this, when one has and can be linked. */
  lastEditor: { displayName: string; handle: string; editedAt: Date | null } | null;
};

/**
 * Edit history for the line under an entity title. Cached with the entity
 * caches and busted by the same tags, so showing it costs no extra query per
 * page view.
 */
export const getProvenance = unstable_cache(
  async (entityType: "lens" | "camera", entityId: number): Promise<Provenance> => {
    const [[row], [editor]] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
          lastEditedAt: sql<Date | null>`max(${revisions.createdAt})`,
        })
        .from(revisions)
        .where(and(eq(revisions.entityType, entityType), eq(revisions.entityId, entityId))),
      db
        .select({
          displayName: users.displayName,
          handle: users.handle,
          editedAt: revisions.createdAt,
        })
        .from(revisions)
        .innerJoin(users, eq(users.id, revisions.userId))
        .where(
          and(
            eq(revisions.entityType, entityType),
            eq(revisions.entityId, entityId),
            isNotNull(users.handle),
            eq(users.isBanned, false),
            ne(users.displayName, WATCHER_DISPLAY_NAME),
          ),
        )
        .orderBy(desc(revisions.createdAt), desc(revisions.id))
        .limit(1),
    ]);

    return {
      revisionCount: row?.count ?? 0,
      lastEditedAt: row?.lastEditedAt ?? null,
      lastEditor:
        editor && editor.handle
          ? { displayName: editor.displayName, handle: editor.handle, editedAt: editor.editedAt }
          : null,
    };
  },
  ["entity-provenance"],
  { revalidate: 2592000, tags: ["lenses", "cameras", "revisions"] },
);
