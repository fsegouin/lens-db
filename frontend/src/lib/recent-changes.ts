import { unstable_cache } from "next/cache";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cameras,
  collections,
  lensSeries,
  lenses,
  revisions,
  systems,
  users,
} from "@/db/schema";
import { WATCHER_DISPLAY_NAME } from "@/lib/provenance";

export type ChangeEntityType = "lens" | "camera" | "system" | "collection" | "series";

export type RecentChange = {
  id: number;
  entityType: ChangeEntityType;
  entityId: number;
  /** Null when the entity has since been deleted or merged away. */
  entityName: string | null;
  /** Site path to the entity, null when it no longer resolves. */
  entityPath: string | null;
  summary: string;
  /** Field names the revision touched, for a readable line when the summary is boilerplate. */
  changedFields: string[];
  isRevert: boolean;
  createdAt: Date | null;
  editor: { displayName: string; handle: string } | null;
};

const PATH_PREFIX: Record<ChangeEntityType, string> = {
  lens: "/lenses/",
  camera: "/cameras/",
  system: "/systems/",
  collection: "/collections/",
  series: "/lenses/series/",
};

type RevisionRow = {
  id: number;
  entityType: string;
  entityId: number;
  summary: string;
  changedFields: unknown;
  isRevert: boolean | null;
  createdAt: Date | null;
  displayName: string | null;
  handle: string | null;
};

/**
 * Resolves each revision's entity to a name and path. entityId is polymorphic,
 * so the five tables are read separately and only for the ids present.
 */
async function attachEntities(rows: RevisionRow[]): Promise<RecentChange[]> {
  const idsOf = (t: ChangeEntityType) =>
    [...new Set(rows.filter((r) => r.entityType === t).map((r) => r.entityId))];

  const lookup = async <T extends { id: number; name: string; slug: string }>(
    ids: number[],
    query: (ids: number[]) => Promise<T[]>,
  ) => new Map((ids.length ? await query(ids) : []).map((e) => [e.id, e]));

  const [lensMap, cameraMap, systemMap, collectionMap, seriesMap] = await Promise.all([
    lookup(idsOf("lens"), (ids) =>
      db.select({ id: lenses.id, name: lenses.name, slug: lenses.slug }).from(lenses).where(inArray(lenses.id, ids)),
    ),
    lookup(idsOf("camera"), (ids) =>
      db.select({ id: cameras.id, name: cameras.name, slug: cameras.slug }).from(cameras).where(inArray(cameras.id, ids)),
    ),
    lookup(idsOf("system"), (ids) =>
      db.select({ id: systems.id, name: systems.name, slug: systems.slug }).from(systems).where(inArray(systems.id, ids)),
    ),
    lookup(idsOf("collection"), (ids) =>
      db.select({ id: collections.id, name: collections.name, slug: collections.slug }).from(collections).where(inArray(collections.id, ids)),
    ),
    lookup(idsOf("series"), (ids) =>
      db.select({ id: lensSeries.id, name: lensSeries.name, slug: lensSeries.slug }).from(lensSeries).where(inArray(lensSeries.id, ids)),
    ),
  ]);

  const maps: Record<ChangeEntityType, Map<number, { name: string; slug: string }>> = {
    lens: lensMap,
    camera: cameraMap,
    system: systemMap,
    collection: collectionMap,
    series: seriesMap,
  };

  return rows.map((r) => {
    const type = r.entityType as ChangeEntityType;
    const entity = maps[type]?.get(r.entityId) ?? null;
    return {
      id: r.id,
      entityType: type,
      entityId: r.entityId,
      entityName: entity?.name ?? null,
      entityPath: entity ? `${PATH_PREFIX[type]}${entity.slug}` : null,
      summary: r.summary,
      changedFields: Array.isArray(r.changedFields)
        ? r.changedFields.filter((f): f is string => typeof f === "string")
        : [],
      isRevert: r.isRevert ?? false,
      createdAt: r.createdAt,
      editor:
        r.displayName && r.handle && r.displayName !== WATCHER_DISPLAY_NAME
          ? { displayName: r.displayName, handle: r.handle }
          : null,
    };
  });
}

const revisionColumns = {
  id: revisions.id,
  entityType: revisions.entityType,
  entityId: revisions.entityId,
  summary: revisions.summary,
  changedFields: revisions.changedFields,
  isRevert: revisions.isRevert,
  createdAt: revisions.createdAt,
  displayName: users.displayName,
  handle: users.handle,
};

/** The last N revisions site-wide, imports included and labelled as such. */
export const getRecentChanges = unstable_cache(
  async (limit = 100): Promise<RecentChange[]> => {
    const rows = await db
      .select(revisionColumns)
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.userId))
      .orderBy(desc(revisions.createdAt), desc(revisions.id))
      .limit(limit);
    return attachEntities(rows);
  },
  ["recent-changes"],
  { revalidate: 300, tags: ["revisions"] },
);

/** One person's most recent edits, for their profile. */
export const getRecentChangesByUser = unstable_cache(
  async (userId: number, limit = 10): Promise<RecentChange[]> => {
    const rows = await db
      .select(revisionColumns)
      .from(revisions)
      .innerJoin(users, eq(users.id, revisions.userId))
      .where(eq(revisions.userId, userId))
      .orderBy(desc(revisions.createdAt), desc(revisions.id))
      .limit(limit);
    return attachEntities(rows);
  },
  ["recent-changes-by-user"],
  { revalidate: 300, tags: ["revisions"] },
);

export type Contributor = {
  displayName: string;
  handle: string;
  editCount: number;
};

/**
 * The people with the most approved edits. The watcher account is left out:
 * it would top the list forever and it is a cron job.
 */
export const getTopContributors = unstable_cache(
  async (limit = 10): Promise<Contributor[]> => {
    const rows = await db
      .select({
        displayName: users.displayName,
        handle: users.handle,
        editCount: sql<number>`coalesce(${users.editCount}, 0)::int`,
      })
      .from(users)
      .where(
        and(
          gt(users.editCount, 0),
          eq(users.isBanned, false),
          ne(users.displayName, WATCHER_DISPLAY_NAME),
        ),
      )
      .orderBy(desc(users.editCount), users.displayName)
      .limit(limit);
    return rows
      .filter((r): r is typeof r & { handle: string } => r.handle != null)
      .map((r) => ({ displayName: r.displayName, handle: r.handle, editCount: r.editCount }));
  },
  ["top-contributors"],
  { revalidate: 300, tags: ["revisions", "kit"] },
);
