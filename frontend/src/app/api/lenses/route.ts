import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems, lensSeries, lensSeriesMemberships, priceEstimates } from "@/db/schema";
import { asc, desc, eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const PAGE_SIZE = 50;
const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.slice(0, 200) || undefined;
  const slug = searchParams.get("slug") || undefined;
  const brand = searchParams.get("brand") || undefined;
  const system = searchParams.get("system") || undefined;
  const coverage = searchParams.get("coverage") || undefined;
  const type = searchParams.get("type") || undefined;
  const minFocal = searchParams.get("minFocal") || undefined;
  const maxFocal = searchParams.get("maxFocal") || undefined;
  const minAperture = searchParams.get("minAperture") || undefined;
  const maxAperture = searchParams.get("maxAperture") || undefined;
  const year = searchParams.get("year") || undefined;
  const lensType = searchParams.get("lensType") || undefined;
  const era = searchParams.get("era") || undefined;
  const productionStatus = searchParams.get("productionStatus") || undefined;
  const series = searchParams.get("series") || undefined;
  const priceMin = searchParams.get("priceMin") || undefined;
  const priceMax = searchParams.get("priceMax") || undefined;
  const sort = searchParams.get("sort") || undefined;
  const order = searchParams.get("order") || undefined;
  const rawCursor = parseInt(searchParams.get("cursor") || "0");
  const cursor = Math.min(
    Math.max(Number.isFinite(rawCursor) ? rawCursor : 0, 0),
    MAX_OFFSET
  );

  const avgPrice = priceEstimates.medianPrice;

  try {
    const conditions = [];

    if (q) {
      // Split query into words, match each with word boundaries
      // Strip punctuation so "f2" matches "F/2", use \m for word boundary so "35mm" doesn't match "135mm"
      const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        if (!clean) continue;
        // Escape regex special chars in the clean word
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Use \m (word start boundary) when the word starts with a digit to prevent "35" matching inside "135"
        const startsWithDigit = /^\d/.test(clean);
        const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
        conditions.push(
          sql`regexp_replace(${lenses.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
        );
      }
    }
    if (slug) {
      conditions.push(eq(lenses.slug, slug));
    }
    if (brand) {
      conditions.push(eq(lenses.brand, brand));
    }
    if (system) {
      conditions.push(eq(systems.slug, system));
    }
    if (coverage) {
      conditions.push(eq(lenses.coverage, coverage));
    }
    if (type === "zoom") {
      conditions.push(eq(lenses.isZoom, true));
    } else if (type === "prime") {
      conditions.push(eq(lenses.isPrime, true));
    } else if (type === "macro") {
      conditions.push(eq(lenses.isMacro, true));
    }
    if (minFocal) {
      const val = parseFloat(minFocal);
      if (Number.isFinite(val)) conditions.push(gte(lenses.focalLengthMin, val));
    }
    if (maxFocal) {
      const val = parseFloat(maxFocal);
      if (Number.isFinite(val)) conditions.push(lte(lenses.focalLengthMax, val));
    }
    if (minAperture) {
      const val = parseFloat(minAperture);
      if (Number.isFinite(val)) conditions.push(gte(lenses.apertureMin, val));
    }
    if (maxAperture) {
      const val = parseFloat(maxAperture);
      if (Number.isFinite(val)) conditions.push(lte(lenses.apertureMin, val));
    }
    if (year) {
      const val = parseInt(year);
      if (Number.isFinite(val)) conditions.push(eq(lenses.yearIntroduced, val));
    }
    if (lensType) {
      conditions.push(eq(lenses.lensType, lensType));
    }
    if (era) {
      conditions.push(eq(lenses.era, era));
    }
    if (productionStatus) {
      conditions.push(eq(lenses.productionStatus, productionStatus));
    }
    if (priceMin) {
      const val = parseInt(priceMin);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} >= ${val}`);
    }
    if (priceMax) {
      const val = parseInt(priceMax);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} <= ${val}`);
    }
    if (series) {
      conditions.push(
        sql`${lenses.id} IN (
          SELECT ${lensSeriesMemberships.lensId} FROM ${lensSeriesMemberships}
          JOIN ${lensSeries} ON ${lensSeries.id} = ${lensSeriesMemberships.seriesId}
          WHERE ${lensSeries.slug} = ${series}
        )`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      name: lenses.name,
      brand: lenses.brand,
      system: systems.name,
      focalLength: lenses.focalLengthMin,
      aperture: lenses.apertureMin,
      year: lenses.yearIntroduced,
      weight: lenses.weightG,
      rating: lenses.averageRating,
      price: avgPrice,
    };
    const sortKey = sort || "";
    const sortCol = sortColumns[sortKey] || lenses.name;
    const orderFn = order === "desc" ? desc : asc;
    const sortByName = sortCol === lenses.name;
    // When sorting by name, sort by the name prefix (before focal length), then focal length numerically
    const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
    // For price sorting, push NULLs to the end
    const orderClauses = sortByName
      ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
      : sortKey === "price"
      ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
      : [orderFn(sortCol)];

    const needsSystemJoin = !!system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(systems, eq(lenses.systemId, systems.id))
          .leftJoin(priceEstimates, and(
            eq(priceEstimates.entityType, "lens"),
            eq(priceEstimates.entityId, lenses.id),
          ))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(priceEstimates, and(
            eq(priceEstimates.entityType, "lens"),
            eq(priceEstimates.entityId, lenses.id),
          ))
          .where(where);
    const total = Number(countResult.count);

    const items = await db
      .select({ lens: lenses, system: systems, avgPrice: avgPrice })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id),
      ))
      .where(where)
      .orderBy(...orderClauses)
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    // Fetch series for the returned lenses
    const lensIds = items.map((r) => r.lens.id);
    const seriesMap: Record<number, { name: string; slug: string }[]> = {};
    if (lensIds.length > 0) {
      const seriesRows = await db
        .select({
          lensId: lensSeriesMemberships.lensId,
          name: lensSeries.name,
          slug: lensSeries.slug,
        })
        .from(lensSeriesMemberships)
        .innerJoin(lensSeries, eq(lensSeriesMemberships.seriesId, lensSeries.id))
        .where(inArray(lensSeriesMemberships.lensId, lensIds));
      for (const row of seriesRows) {
        if (!seriesMap[row.lensId]) seriesMap[row.lensId] = [];
        seriesMap[row.lensId].push({ name: row.name, slug: row.slug });
      }
    }

    const itemsWithSeries = items.map((r) => ({
      ...r,
      series: seriesMap[r.lens.id] || [],
    }));

    return NextResponse.json({ items: itemsWithSeries, nextCursor, total });
  } catch (error) {
    console.error("GET /api/lenses error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
