import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI, getAdminUserFromToken } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { revalidateEntity, touchesLists } from "@/lib/revalidate-entity";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
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
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const admin = await getAdminUserFromToken(token);
  const body = await request.json();
  const {
    name, slug, url, systemId, description, alias,
    sensorType, sensorSize, megapixels, resolution,
    yearIntroduced, bodyType, weightG, specs, images,
  } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (url !== undefined) updates.url = url || null;
  if (systemId !== undefined) updates.systemId = systemId || null;
  if (description !== undefined) updates.description = description || null;
  if (alias !== undefined) updates.alias = alias || null;
  if (sensorType !== undefined) updates.sensorType = sensorType || null;
  if (sensorSize !== undefined) updates.sensorSize = sensorSize || null;
  if (megapixels !== undefined) updates.megapixels = megapixels != null ? Number(megapixels) : null;
  if (resolution !== undefined) updates.resolution = resolution || null;
  if (yearIntroduced !== undefined) updates.yearIntroduced = yearIntroduced != null ? Number(yearIntroduced) : null;
  if (bodyType !== undefined) updates.bodyType = bodyType || null;
  if (weightG !== undefined) updates.weightG = weightG != null ? Number(weightG) : null;
  if (specs !== undefined) updates.specs = specs;
  if (images !== undefined) updates.images = images;

  // The form sends every field, so work out which ones actually changed
  // before deciding how much cache the edit has to clear.
  const [previous] = await db
    .select()
    .from(cameras)
    .where(eq(cameras.id, parseInt(id)))
    .limit(1);
  if (!previous) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const before = previous as Record<string, unknown>;

  const [updated] = await db
    .update(cameras)
    .set(updates)
    .where(eq(cameras.id, parseInt(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await createRevision({
    entityType: "camera",
    entityId: parseInt(id),
    userId: admin!.id,
    summary: "Admin edit",
    autoPatrol: true,
  });

  const changed = Object.keys(updates).filter(
    (k) => String(updates[k] ?? "") !== String(before[k] ?? ""),
  );
  revalidateEntity("camera", updated.slug, touchesLists("camera", changed) ? "lists" : "row");
  if (updated.slug !== previous.slug) revalidatePath(`/cameras/${previous.slug}`);

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
  const [deleted] = await db
    .delete(cameras)
    .where(eq(cameras.id, parseInt(id)))
    .returning({ slug: cameras.slug });

  if (deleted) {
    revalidatePath(`/cameras/${deleted.slug}`);
    revalidateTag("cameras", "max");
  }

  return NextResponse.json({ success: true });
}
