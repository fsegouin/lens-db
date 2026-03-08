import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, eq, and, sql } from "drizzle-orm";
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
  const rawCursor = parseInt(searchParams.get("cursor") || "0");
  const cursor = Math.min(
    Math.max(Number.isFinite(rawCursor) ? rawCursor : 0, 0),
    MAX_OFFSET
  );

  try {
    const conditions = [];
    if (q) {
      const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        if (!clean) continue;
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const startsWithDigit = /^\d/.test(clean);
        const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
        conditions.push(
          sql`regexp_replace(${cameras.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
        );
      }
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cameras)
      .where(where);
    const total = Number(countResult.count);

    const items = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(asc(cameras.name))
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    return NextResponse.json({ items, nextCursor, total });
  } catch (error) {
    console.error("GET /api/cameras error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
