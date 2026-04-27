import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, or, sql, eq } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";
import { buildOrderBy } from "@/lib/admin-sort";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const missingImages = searchParams.get("missing_images") === "1";
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");

  const nameConditions = q ? buildNameSearch(cameras.name, q) : [];
  const aliasConditions = q ? buildNameSearch(cameras.alias, q) : [];
  const conditions =
    nameConditions.length > 0 || aliasConditions.length > 0
      ? [
          or(
            nameConditions.length > 0 ? and(...nameConditions) : undefined,
            aliasConditions.length > 0 ? and(...aliasConditions) : undefined
          )!,
        ]
      : [];
  if (missingImages) {
    conditions.push(
      sql`(jsonb_typeof(${cameras.images}) <> 'array' OR jsonb_array_length(${cameras.images}) = 0)`
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortMap = {
    name: cameras.name,
    system: systems.name,
    sensorType: cameras.sensorType,
    megapixels: cameras.megapixels,
    year: cameras.yearIntroduced,
  };
  const orderBy = buildOrderBy(sortParam, orderParam, sortMap, cameras.name);

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
      .orderBy(orderBy)
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
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const {
    name, slug, url, systemId, description, alias,
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
      alias: alias || null,
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
