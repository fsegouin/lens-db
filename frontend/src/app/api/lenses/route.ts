import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { asc, desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const PAGE_SIZE = 50;
const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") || undefined;
  const brand = searchParams.get("brand") || undefined;
  const system = searchParams.get("system") || undefined;
  const type = searchParams.get("type") || undefined;
  const minFocal = searchParams.get("minFocal") || undefined;
  const maxFocal = searchParams.get("maxFocal") || undefined;
  const minAperture = searchParams.get("minAperture") || undefined;
  const maxAperture = searchParams.get("maxAperture") || undefined;
  const year = searchParams.get("year") || undefined;
  const lensType = searchParams.get("lensType") || undefined;
  const era = searchParams.get("era") || undefined;
  const productionStatus = searchParams.get("productionStatus") || undefined;
  const sort = searchParams.get("sort") || undefined;
  const order = searchParams.get("order") || undefined;
  const rawCursor = parseInt(searchParams.get("cursor") || "0");
  const cursor = Math.min(
    Math.max(Number.isFinite(rawCursor) ? rawCursor : 0, 0),
    MAX_OFFSET
  );

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
    if (brand) {
      conditions.push(eq(lenses.brand, brand));
    }
    if (system) {
      conditions.push(eq(systems.slug, system));
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
    };
    const sortCol = sortColumns[sort || ""] || lenses.name;
    const orderFn = order === "desc" ? desc : asc;

    const needsSystemJoin = !!system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .leftJoin(systems, eq(lenses.systemId, systems.id))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(lenses)
          .where(where);
    const total = Number(countResult.count);

    const items = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    return NextResponse.json({ items, nextCursor, total });
  } catch (error) {
    console.error("GET /api/lenses error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
