import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lensSeries, lensSeriesMemberships, lenses } from "@/db/schema";
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
  const series = await db
    .select()
    .from(lensSeries)
    .where(eq(lensSeries.id, parseInt(id)))
    .then((r) => r[0]);

  if (!series) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const seriesLenses = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      brand: lenses.brand,
    })
    .from(lensSeriesMemberships)
    .innerJoin(lenses, eq(lensSeriesMemberships.lensId, lenses.id))
    .where(eq(lensSeriesMemberships.seriesId, parseInt(id)));

  return NextResponse.json({ ...series, lenses: seriesLenses });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const numericId = parseInt(id);
  const admin = await getAdminUserFromToken(token);
  const body = await request.json();
  const { name, slug, description, lensIds } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description || null;

  const [updated] = await db
    .update(lensSeries)
    .set(updates)
    .where(eq(lensSeries.id, numericId))
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
      .delete(lensSeriesMemberships)
      .where(eq(lensSeriesMemberships.seriesId, numericId));

    if (lensIds.length > 0) {
      await db.insert(lensSeriesMemberships).values(
        lensIds.map((lensId: number) => ({
          lensId,
          seriesId: numericId,
        }))
      );
    }
  }

  await createRevision({
    entityType: "series",
    entityId: numericId,
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
  await db.delete(lensSeries).where(eq(lensSeries.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
