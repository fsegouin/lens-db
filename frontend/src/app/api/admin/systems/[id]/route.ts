import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systems } from "@/db/schema";
import { requireAdminAPI, getAdminUserFromToken } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const system = await db
    .select()
    .from(systems)
    .where(eq(systems.id, parseInt(id)))
    .then((r) => r[0]);

  if (!system) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(system);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const admin = await getAdminUserFromToken(token);
  const body = await request.json();
  const { name, slug, manufacturer, mountType, description } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (manufacturer !== undefined) updates.manufacturer = manufacturer || null;
  if (mountType !== undefined) updates.mountType = mountType || null;
  if (description !== undefined) updates.description = description || null;

  const [updated] = await db
    .update(systems)
    .set(updates)
    .where(eq(systems.id, parseInt(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await createRevision({
    entityType: "system",
    entityId: parseInt(id),
    userId: admin!.id,
    summary: "Admin edit",
    autoPatrol: true,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  await db.delete(systems).where(eq(systems.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
