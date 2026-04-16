import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems, lensTags, tags, lensSeriesMemberships, lensSeries } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, sql, eq, inArray } from "drizzle-orm";
import { buildNameSearch } from "@/lib/search";
import { buildOrderBy } from "@/lib/admin-sort";

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

  const conditions = q ? buildNameSearch(lenses.name, q) : [];
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

  // Batch-fetch tags and series for the returned lenses
  const lensIds = items.map((i) => i.id);
  let tagMap: Record<number, { id: number; name: string }[]> = {};
  let seriesMap: Record<number, { id: number; name: string }[]> = {};

  if (lensIds.length > 0) {
    const [tagRows, seriesRows] = await Promise.all([
      db
        .select({ lensId: lensTags.lensId, tagId: tags.id, tagName: tags.name })
        .from(lensTags)
        .innerJoin(tags, eq(lensTags.tagId, tags.id))
        .where(inArray(lensTags.lensId, lensIds)),
      db
        .select({ lensId: lensSeriesMemberships.lensId, seriesId: lensSeries.id, seriesName: lensSeries.name })
        .from(lensSeriesMemberships)
        .innerJoin(lensSeries, eq(lensSeriesMemberships.seriesId, lensSeries.id))
        .where(inArray(lensSeriesMemberships.lensId, lensIds)),
    ]);

    tagMap = {};
    for (const r of tagRows) {
      (tagMap[r.lensId] ??= []).push({ id: r.tagId, name: r.tagName });
    }
    seriesMap = {};
    for (const r of seriesRows) {
      (seriesMap[r.lensId] ??= []).push({ id: r.seriesId, name: r.seriesName });
    }
  }

  const enrichedItems = items.map((item) => ({
    ...item,
    tags: tagMap[item.id] ?? [],
    series: seriesMap[item.id] ?? [],
  }));

  return NextResponse.json({ items: enrichedItems, total, nextCursor });
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
      coverage: body.coverage || null,
      specs: body.specs ?? {},
      images: body.images ?? [],
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
