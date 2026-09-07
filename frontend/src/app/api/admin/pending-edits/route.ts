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
import { applyPendingEditApproval, notifyEditReviewed } from "@/lib/pending-edits";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";

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

  // Fetch each entity's name, slug and the values the edit would overwrite, so
  // the reviewer sees a before and after rather than a bare proposed value.
  // One query per entity type rather than one per entity, and only the columns
  // this page actually needs: a whole lens row carries its description and
  // specs blob, which is about 2 KB nobody here would read.
  const entityNames: Record<string, string> = {};
  const entitySlugs: Record<string, string> = {};
  const currentValues: Record<string, Record<string, unknown>> = {};
  const idsByType = new Map<keyof typeof entityTables, Set<number>>();
  const fieldsByType = new Map<keyof typeof entityTables, Set<string>>();
  for (const item of items) {
    const type = item.entityType as keyof typeof entityTables;
    if (!entityTables[type]) continue;
    // entityId 0 is a submission of a brand new entity: there is no row to
    // link to and nothing it could be overwriting.
    if (!item.entityId) continue;
    if (!idsByType.has(type)) idsByType.set(type, new Set());
    idsByType.get(type)!.add(item.entityId);
    if (!fieldsByType.has(type)) fieldsByType.set(type, new Set());
    for (const field of Object.keys((item.changes ?? {}) as Record<string, unknown>)) {
      if (field !== "_audit") fieldsByType.get(type)!.add(field);
    }
  }
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const table = entityTables[type];
      // The selection is built at runtime from whichever fields this page's
      // edits touch, so it cannot be expressed in Drizzle's generic types; the
      // rows come back as plain records and are read by key below.
      const byName = table as unknown as Record<string, PgColumn | undefined>;
      const columns: Record<string, PgColumn> = {
        id: table.id,
        name: table.name,
        slug: table.slug,
      };
      for (const field of fieldsByType.get(type) ?? []) {
        // A proposed key that is not a column of this table (a spec blob key,
        // or a field belonging to another entity) simply has no before value.
        const column = byName[field];
        if (column instanceof PgColumn && !(field in columns)) columns[field] = column;
      }
      const rows = (await db
        .select(columns)
        .from(table)
        .where(inArray(table.id, [...ids]))) as Record<string, unknown>[];
      const found = new Map<number, Record<string, unknown>>(
        rows.map((r) => [Number(r.id), r]),
      );
      for (const id of ids) {
        const row = found.get(id);
        entityNames[`${type}:${id}`] = (row?.name as string) || `Unknown ${type}`;
        if (row?.slug) entitySlugs[`${type}:${id}`] = row.slug as string;
        if (row) currentValues[`${type}:${id}`] = row;
      }
    })
  );

  const enriched = items.map((item) => {
    const key = `${item.entityType}:${item.entityId}`;
    const row = currentValues[key] ?? {};
    const current: Record<string, unknown> = {};
    for (const field of Object.keys((item.changes ?? {}) as Record<string, unknown>)) {
      if (field === "_audit") continue;
      if (field in row) current[field] = row[field];
    }
    return {
      ...item,
      entityName: entityNames[key] || "Unknown",
      entitySlug: entitySlugs[key] ?? null,
      current,
    };
  });

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
      if (result.ok) {
        approved++;
        await notifyEditReviewed(edit, { status: "approved", entityId: result.entityId }, admin.id);
      } else {
        failed.push({ id: edit.id, reason: result.reason });
      }
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
