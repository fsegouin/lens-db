import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { asc, eq, and, gte, lte, sql } from "drizzle-orm";
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
  const aperture = searchParams.get("aperture") || undefined;
  const year = searchParams.get("year") || undefined;
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
    if (aperture) {
      const val = parseFloat(aperture);
      if (Number.isFinite(val)) conditions.push(eq(lenses.apertureMin, val));
    }
    if (year) {
      const val = parseInt(year);
      if (Number.isFinite(val)) conditions.push(eq(lenses.yearIntroduced, val));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
      .orderBy(asc(lenses.name))
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    return NextResponse.json({ items, nextCursor, total });
  } catch (error) {
    console.error("GET /api/lenses error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
