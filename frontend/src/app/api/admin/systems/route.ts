import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systems } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, or, sql } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";
import { buildOrderBy } from "@/lib/admin-sort";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");

  const nameConditions = q ? buildNameSearch(systems.name, q) : [];
  const mfrConditions = q ? buildNameSearch(systems.manufacturer, q) : [];
  const where = q
    ? or(
        nameConditions.length > 0 ? and(...nameConditions) : undefined,
        mfrConditions.length > 0 ? and(...mfrConditions) : undefined
      )
    : undefined;

  const sortMap = {
    name: systems.name,
    manufacturer: systems.manufacturer,
    mountType: systems.mountType,
  };
  const orderBy = buildOrderBy(sortParam, orderParam, sortMap, systems.name);

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: systems.id,
        name: systems.name,
        slug: systems.slug,
        manufacturer: systems.manufacturer,
        mountType: systems.mountType,
        description: systems.description,
      })
      .from(systems)
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset(cursor),
    db
      .select({ count: sql<number>`count(*)` })
      .from(systems)
      .where(where),
  ]);

  const total = Number(countResult[0].count);
  const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

  return NextResponse.json({ items, total, nextCursor });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { name, slug, manufacturer, mountType, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const finalSlug =
    slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [created] = await db
    .insert(systems)
    .values({
      name,
      slug: finalSlug,
      manufacturer: manufacturer || null,
      mountType: mountType || null,
      description: description || null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
