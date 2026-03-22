import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, revisions } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const userId = parseInt(id, 10);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      editCount: users.editCount,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      banReason: users.banReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get recent edits
  const recentEdits = await db
    .select({
      id: revisions.id,
      entityType: revisions.entityType,
      entityId: revisions.entityId,
      revisionNumber: revisions.revisionNumber,
      summary: revisions.summary,
      changedFields: revisions.changedFields,
      isRevert: revisions.isRevert,
      createdAt: revisions.createdAt,
    })
    .from(revisions)
    .where(eq(revisions.userId, userId))
    .orderBy(desc(revisions.createdAt))
    .limit(50);

  return NextResponse.json({ user, recentEdits });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const userId = parseInt(id, 10);
  const body = await request.json();
  const { role, isBanned, banReason } = body;

  const updates: Record<string, unknown> = {};
  if (role !== undefined && ["user", "trusted", "admin"].includes(role)) {
    updates.role = role;
  }
  if (isBanned !== undefined) {
    updates.isBanned = Boolean(isBanned);
    updates.banReason = isBanned ? (banReason || null) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
