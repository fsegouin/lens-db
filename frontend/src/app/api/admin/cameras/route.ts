import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { ilike, asc, sql, eq } from "drizzle-orm";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);

  const where = q ? ilike(cameras.name, `%${q}%`) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: cameras.id,
        name: cameras.name,
        slug: cameras.slug,
        systemId: cameras.systemId,
        systemName: systems.name,
        sensorType: cameras.sensorType,
        megapixels: cameras.megapixels,
        yearIntroduced: cameras.yearIntroduced,
      })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(asc(cameras.name))
      .limit(PAGE_SIZE)
      .offset(cursor),
    db
      .select({ count: sql<number>`count(*)` })
      .from(cameras)
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
  const {
    name, slug, url, systemId, description,
    sensorType, sensorSize, megapixels, resolution,
    yearIntroduced, bodyType, weightG, specs, images,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const finalSlug =
    slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [created] = await db
    .insert(cameras)
    .values({
      name,
      slug: finalSlug,
      url: url || null,
      systemId: systemId || null,
      description: description || null,
      sensorType: sensorType || null,
      sensorSize: sensorSize || null,
      megapixels: megapixels != null ? Number(megapixels) : null,
      resolution: resolution || null,
      yearIntroduced: yearIntroduced != null ? Number(yearIntroduced) : null,
      bodyType: bodyType || null,
      weightG: weightG != null ? Number(weightG) : null,
      specs: specs || {},
      images: images || [],
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
