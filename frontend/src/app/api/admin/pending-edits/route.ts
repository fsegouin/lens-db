import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  pendingEdits,
  users,
  lenses,
  cameras,
  systems,
  collections,
  lensSeries,
} from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq, desc, sql } from "drizzle-orm";

const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  const where = eq(pendingEdits.status, "pending");

  const [items, [countResult]] = await Promise.all([
    db
      .select({
        id: pendingEdits.id,
        entityType: pendingEdits.entityType,
        entityId: pendingEdits.entityId,
        changes: pendingEdits.changes,
        summary: pendingEdits.summary,
        userId: pendingEdits.userId,
        displayName: users.displayName,
        createdAt: pendingEdits.createdAt,
      })
      .from(pendingEdits)
      .leftJoin(users, eq(pendingEdits.userId, users.id))
      .where(where)
      .orderBy(desc(pendingEdits.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::integer` })
      .from(pendingEdits)
      .where(where),
  ]);

  // Fetch entity names
  const entityNames: Record<string, string> = {};
  for (const item of items) {
    const key = `${item.entityType}:${item.entityId}`;
    if (entityNames[key]) continue;
    const table = entityTables[item.entityType as keyof typeof entityTables];
    if (table) {
      const [row] = await db
        .select({ name: table.name })
        .from(table)
        .where(eq(table.id, item.entityId))
        .limit(1);
      entityNames[key] = row?.name || `Unknown ${item.entityType}`;
    }
  }

  const enriched = items.map((item) => ({
    ...item,
    entityName: entityNames[`${item.entityType}:${item.entityId}`] || "Unknown",
  }));

  return NextResponse.json({
    pendingEdits: enriched,
    total: countResult.total,
    page,
    totalPages: Math.ceil(countResult.total / limit),
  });
}
