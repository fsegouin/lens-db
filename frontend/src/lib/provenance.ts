import { unstable_cache } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { revisions } from "@/db/schema";

export type Provenance = {
  revisionCount: number;
  lastEditedAt: Date | null;
};

/**
 * Edit history for the line under an entity title. Cached with the entity
 * caches and busted by the same tags, so showing it costs no extra query per
 * page view.
 */
export const getProvenance = unstable_cache(
  async (entityType: "lens" | "camera", entityId: number): Promise<Provenance> => {
    const [row] = await db
      .select({
        count: sql<number>`count(*)::int`,
        lastEditedAt: sql<Date | null>`max(${revisions.createdAt})`,
      })
      .from(revisions)
      .where(and(eq(revisions.entityType, entityType), eq(revisions.entityId, entityId)));

    return {
      revisionCount: row?.count ?? 0,
      lastEditedAt: row?.lastEditedAt ?? null,
    };
  },
  ["entity-provenance"],
  { revalidate: 2592000, tags: ["lenses", "cameras", "revisions"] },
);
