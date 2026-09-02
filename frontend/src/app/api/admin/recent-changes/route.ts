import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { revisions, users, lenses, cameras, systems, collections, lensSeries } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq, desc, and, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const entityType = searchParams.get("entityType");
  const unpatrolledOnly = searchParams.get("unpatrolled") === "true";
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (entityType) {
    conditions.push(eq(revisions.entityType, entityType));
  }
  if (unpatrolledOnly) {
    conditions.push(eq(revisions.isPatrolled, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [countResult]] = await Promise.all([
    db
      .select({
        id: revisions.id,
        entityType: revisions.entityType,
        entityId: revisions.entityId,
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
      .where(where)
      .orderBy(desc(revisions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::integer` })
      .from(revisions)
      .where(where),
  ]);

  // Fetch entity names for display
  const entityNames: Record<string, string> = {};
  const tables = { lens: lenses, camera: cameras, system: systems, collection: collections, series: lensSeries } as const;
  const uniqueEntities = new Map<string, { table: (typeof tables)[keyof typeof tables]; entityType: string; entityId: number }>();
  for (const item of items) {
    const key = `${item.entityType}:${item.entityId}`;
    if (uniqueEntities.has(key)) continue;
    const table = tables[item.entityType as keyof typeof tables];
    if (table) {
      uniqueEntities.set(key, { table, entityType: item.entityType, entityId: item.entityId });
    }
  }
  await Promise.all(
    [...uniqueEntities].map(async ([key, { table, entityType: type, entityId }]) => {
      const [row] = await db.select({ name: table.name }).from(table).where(eq(table.id, entityId)).limit(1);
      entityNames[key] = row?.name || `Unknown ${type}`;
    })
  );

  const enriched = items.map((item) => ({
    ...item,
    entityName: entityNames[`${item.entityType}:${item.entityId}`] || "Unknown",
  }));

  return NextResponse.json({
    revisions: enriched,
    total: countResult.total,
    page,
    totalPages: Math.ceil(countResult.total / limit),
  });
}
