import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const result = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      slug: lenses.slug,
      url: lenses.url,
      brand: lenses.brand,
      systemId: lenses.systemId,
      systemName: systems.name,
      description: lenses.description,
      lensType: lenses.lensType,
      era: lenses.era,
      productionStatus: lenses.productionStatus,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      apertureMax: lenses.apertureMax,
      weightG: lenses.weightG,
      filterSizeMm: lenses.filterSizeMm,
      minFocusDistanceM: lenses.minFocusDistanceM,
      maxMagnification: lenses.maxMagnification,
      lensElements: lenses.lensElements,
      lensGroups: lenses.lensGroups,
      diaphragmBlades: lenses.diaphragmBlades,
      yearIntroduced: lenses.yearIntroduced,
      yearDiscontinued: lenses.yearDiscontinued,
      isZoom: lenses.isZoom,
      isMacro: lenses.isMacro,
      isPrime: lenses.isPrime,
      hasStabilization: lenses.hasStabilization,
      hasAutofocus: lenses.hasAutofocus,
      specs: lenses.specs,
      images: lenses.images,
      createdAt: lenses.createdAt,
    })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lenses.id, parseInt(id)))
    .then((r) => r[0]);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const fields = [
    "name", "slug", "url", "brand", "systemId", "description",
    "lensType", "era", "productionStatus",
    "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
    "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
    "lensElements", "lensGroups", "diaphragmBlades",
    "yearIntroduced", "yearDiscontinued",
    "isZoom", "isMacro", "isPrime", "hasStabilization", "hasAutofocus",
    "specs", "images",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Normalize empty strings to null for optional text fields
  const textFields = [
    "url", "brand", "description", "lensType", "era", "productionStatus",
  ];
  for (const field of textFields) {
    if (updates[field] === "") updates[field] = null;
  }

  const [updated] = await db
    .update(lenses)
    .set(updates)
    .where(eq(lenses.id, parseInt(id)))
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
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  await db.delete(lenses).where(eq(lenses.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
