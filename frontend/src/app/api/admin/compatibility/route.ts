import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lensCompatibility, lenses, cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { or, asc, sql, eq, and } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);

  const lensConditions = q ? buildNameSearch(lenses.name, q) : [];
  const cameraConditions = q ? buildNameSearch(cameras.name, q) : [];
  const where = q
    ? or(
        lensConditions.length > 0 ? and(...lensConditions) : undefined,
        cameraConditions.length > 0 ? and(...cameraConditions) : undefined
      )
    : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        lensId: lensCompatibility.lensId,
        cameraId: lensCompatibility.cameraId,
        lensName: lenses.name,
        cameraName: cameras.name,
        isNative: lensCompatibility.isNative,
        notes: lensCompatibility.notes,
      })
      .from(lensCompatibility)
      .innerJoin(lenses, eq(lensCompatibility.lensId, lenses.id))
      .innerJoin(cameras, eq(lensCompatibility.cameraId, cameras.id))
      .where(where)
      .orderBy(asc(lenses.name), asc(cameras.name))
      .limit(PAGE_SIZE)
      .offset(cursor),
    db
      .select({ count: sql<number>`count(*)` })
      .from(lensCompatibility)
      .innerJoin(lenses, eq(lensCompatibility.lensId, lenses.id))
      .innerJoin(cameras, eq(lensCompatibility.cameraId, cameras.id))
      .where(where),
  ]);

  const total = Number(countResult[0].count);
  const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

  return NextResponse.json({ items, total, nextCursor });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { lensId, cameraId, isNative, notes } = body;

  if (!lensId || !cameraId || !Number.isInteger(lensId) || !Number.isInteger(cameraId) || lensId < 1 || cameraId < 1) {
    return NextResponse.json({ error: "Valid lensId and cameraId are required" }, { status: 400 });
  }

  try {
    await db.insert(lensCompatibility).values({
      lensId,
      cameraId,
      isNative: isNative ?? true,
      notes: notes || null,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return NextResponse.json({ error: "This compatibility entry already exists" }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { lensId, cameraId } = body;

  if (!lensId || !cameraId) {
    return NextResponse.json({ error: "lensId and cameraId are required" }, { status: 400 });
  }

  await db
    .delete(lensCompatibility)
    .where(
      and(
        eq(lensCompatibility.lensId, lensId),
        eq(lensCompatibility.cameraId, cameraId)
      )
    );

  return NextResponse.json({ success: true });
}
