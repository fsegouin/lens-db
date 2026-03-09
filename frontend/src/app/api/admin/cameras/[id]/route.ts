import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const camera = await db
    .select()
    .from(cameras)
    .where(eq(cameras.id, parseInt(id)))
    .then((r) => r[0]);

  if (!camera) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(camera);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const {
    name, slug, url, systemId, description,
    sensorType, sensorSize, megapixels, resolution,
    yearIntroduced, bodyType, weightG, specs, images,
  } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (url !== undefined) updates.url = url || null;
  if (systemId !== undefined) updates.systemId = systemId || null;
  if (description !== undefined) updates.description = description || null;
  if (sensorType !== undefined) updates.sensorType = sensorType || null;
  if (sensorSize !== undefined) updates.sensorSize = sensorSize || null;
  if (megapixels !== undefined) updates.megapixels = megapixels != null ? Number(megapixels) : null;
  if (resolution !== undefined) updates.resolution = resolution || null;
  if (yearIntroduced !== undefined) updates.yearIntroduced = yearIntroduced != null ? Number(yearIntroduced) : null;
  if (bodyType !== undefined) updates.bodyType = bodyType || null;
  if (weightG !== undefined) updates.weightG = weightG != null ? Number(weightG) : null;
  if (specs !== undefined) updates.specs = specs;
  if (images !== undefined) updates.images = images;

  const [updated] = await db
    .update(cameras)
    .set(updates)
    .where(eq(cameras.id, parseInt(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  await db.delete(cameras).where(eq(cameras.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
