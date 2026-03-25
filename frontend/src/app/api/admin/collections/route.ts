import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collections, lensCollections } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, asc, desc, sql, eq } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");

  const conditions = q ? buildNameSearch(collections.name, q) : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const direction = orderParam === "desc" ? desc : asc;
  const lensCountExpr = sql<number>`count(${lensCollections.lensId})`;
  const orderByMap: Record<string, ReturnType<typeof asc>> = {
    name: direction(collections.name),
    lensCount: direction(lensCountExpr),
  };
  const orderBy = (sortParam && orderByMap[sortParam]) || asc(collections.name);

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: collections.id,
        name: collections.name,
        slug: collections.slug,
        description: collections.description,
        lensCount: lensCountExpr,
      })
      .from(collections)
      .leftJoin(lensCollections, eq(collections.id, lensCollections.collectionId))
      .where(where)
      .groupBy(collections.id)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset(cursor),
    db
      .select({ count: sql<number>`count(*)` })
      .from(collections)
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
  const { name } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const finalSlug =
    body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [created] = await db
    .insert(collections)
    .values({
      name,
      slug: finalSlug,
      description: body.description || null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
