import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collections, lensCollections, lenses } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, parseInt(id)))
    .then((r) => r[0]);

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const collectionLenses = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      brand: lenses.brand,
    })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .where(eq(lensCollections.collectionId, parseInt(id)));

  return NextResponse.json({ ...collection, lenses: collectionLenses });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const numericId = parseInt(id);
  const body = await request.json();
  const { name, slug, description, lensIds } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description || null;

  const [updated] = await db
    .update(collections)
    .set(updates)
    .where(eq(collections.id, numericId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (lensIds !== undefined) {
    if (!Array.isArray(lensIds) || !lensIds.every((id: unknown) => typeof id === "number" && Number.isInteger(id))) {
      return NextResponse.json({ error: "lensIds must be an array of integers" }, { status: 400 });
    }

    // Delete all existing memberships and insert new ones
    await db
      .delete(lensCollections)
      .where(eq(lensCollections.collectionId, numericId));

    if (lensIds.length > 0) {
      await db.insert(lensCollections).values(
        lensIds.map((lensId: number) => ({
          lensId,
          collectionId: numericId,
        }))
      );
    }
  }

  await createRevision({
    entityType: "collection",
    entityId: numericId,
    summary: "Admin edit",
    autoPatrol: true,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  await db.delete(collections).where(eq(collections.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
