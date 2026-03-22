import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, sql, eq } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";
import { buildOrderBy } from "@/lib/admin-sort";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const verified = searchParams.get("verified");
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");

  const conditions = q ? buildNameSearch(lenses.name, q) : [];
  if (verified === "true") conditions.push(eq(lenses.verified, true));
  if (verified === "false") conditions.push(eq(lenses.verified, false));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortMap = {
    name: lenses.name,
    brand: lenses.brand,
    system: systems.name,
    focalLength: lenses.focalLengthMin,
    year: lenses.yearIntroduced,
  };
  const orderBy = buildOrderBy(sortParam, orderParam, sortMap, lenses.name);

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: lenses.id,
        name: lenses.name,
        slug: lenses.slug,
        brand: lenses.brand,
        systemName: systems.name,
        focalLengthMin: lenses.focalLengthMin,
        focalLengthMax: lenses.focalLengthMax,
        yearIntroduced: lenses.yearIntroduced,
        verified: lenses.verified,
      })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset(cursor),
    db
      .select({ count: sql<number>`count(*)` })
      .from(lenses)
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
    .insert(lenses)
    .values({
      name,
      slug: finalSlug,
      url: body.url || null,
      brand: body.brand || null,
      systemId: body.systemId || null,
      description: body.description || null,
      lensType: body.lensType || null,
      era: body.era || null,
      productionStatus: body.productionStatus || null,
      focalLengthMin: body.focalLengthMin ?? null,
      focalLengthMax: body.focalLengthMax ?? null,
      apertureMin: body.apertureMin ?? null,
      apertureMax: body.apertureMax ?? null,
      weightG: body.weightG ?? null,
      filterSizeMm: body.filterSizeMm ?? null,
      minFocusDistanceM: body.minFocusDistanceM ?? null,
      maxMagnification: body.maxMagnification ?? null,
      lensElements: body.lensElements ?? null,
      lensGroups: body.lensGroups ?? null,
      diaphragmBlades: body.diaphragmBlades ?? null,
      yearIntroduced: body.yearIntroduced ?? null,
      yearDiscontinued: body.yearDiscontinued ?? null,
      isZoom: body.isZoom ?? false,
      isMacro: body.isMacro ?? false,
      isPrime: body.isPrime ?? false,
      hasStabilization: body.hasStabilization ?? false,
      hasAutofocus: body.hasAutofocus ?? false,
      specs: body.specs ?? {},
      images: body.images ?? [],
      verified: body.verified ?? true,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
