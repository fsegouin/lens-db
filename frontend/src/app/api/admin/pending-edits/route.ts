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
import { getCurrentUser } from "@/lib/user-auth";
import { applyPendingEditApproval } from "@/lib/pending-edits";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";

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
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
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

  // Fetch entity names (one query per entity type instead of one per entity)
  const entityNames: Record<string, string> = {};
  const idsByType = new Map<keyof typeof entityTables, Set<number>>();
  for (const item of items) {
    const type = item.entityType as keyof typeof entityTables;
    if (!entityTables[type]) continue;
    if (!idsByType.has(type)) idsByType.set(type, new Set());
    idsByType.get(type)!.add(item.entityId);
  }
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const table = entityTables[type];
      const rows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, [...ids]));
      const found = new Map<number, string>(rows.map((r) => [r.id, r.name]));
      for (const id of ids) {
        entityNames[`${type}:${id}`] = found.get(id) || `Unknown ${type}`;
      }
    })
  );

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

export const maxDuration = 300;

/**
 * POST: bulk actions. Currently only { action: "approve_all", afterId?, limit? }.
 * Approves up to `limit` (default 25) pending edits with id > afterId; the
 * client loops passing the returned lastId until it is null. Edits that fail
 * validation stay pending (skipped by the cursor on later batches) and are
 * reported.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.action !== "approve_all") {
    return NextResponse.json({ error: "Invalid action. Use 'approve_all'" }, { status: 400 });
  }
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? 25), 10) || 25, 1), 50);
  const afterId = parseInt(String(body.afterId ?? 0), 10) || 0;

  const batch = await db
    .select()
    .from(pendingEdits)
    .where(sql`${pendingEdits.status} = 'pending' AND ${pendingEdits.id} > ${afterId}`)
    .orderBy(asc(pendingEdits.id))
    .limit(limit);

  let approved = 0;
  const failed: { id: number; reason: string }[] = [];
  for (const edit of batch) {
    try {
      const result = await applyPendingEditApproval(edit, admin.id);
      if (result.ok) approved++;
      else failed.push({ id: edit.id, reason: result.reason });
    } catch (error) {
      failed.push({ id: edit.id, reason: String(error) });
    }
  }

  return NextResponse.json({
    approved,
    failed,
    lastId: batch.length > 0 ? batch[batch.length - 1].id : null,
  });
}
