import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, desc, eq, and, or, sql } from "drizzle-orm";
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
  const system = searchParams.get("system") || undefined;
  const type = searchParams.get("type") || undefined;
  const model = searchParams.get("model") || undefined;
  const filmType = searchParams.get("filmType") || undefined;
  const sensorType = searchParams.get("sensorType") || undefined;
  const cropFactor = searchParams.get("cropFactor") || undefined;
  const year = searchParams.get("year") || undefined;
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
      const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        if (!clean) continue;
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const startsWithDigit = /^\d/.test(clean);
        const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
        conditions.push(
          or(
            sql`regexp_replace(${cameras.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`,
            sql`regexp_replace(${cameras.alias}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
          )
        );
      }
    }
    if (system) {
      conditions.push(eq(systems.slug, system));
    }
    if (type) {
      conditions.push(sql`${cameras.specs}->>'Type' = ${type}`);
    }
    if (model) {
      conditions.push(
        sql`${cameras.specs}->>'Model' LIKE ${model + "%"}`
      );
    }
    if (filmType) {
      conditions.push(sql`${cameras.specs}->>'Film type' = ${filmType}`);
    }
    if (sensorType) {
      conditions.push(eq(cameras.sensorType, sensorType));
    }
    if (cropFactor) {
      conditions.push(
        sql`${cameras.specs}->>'Crop factor' = ${cropFactor}`
      );
    }
    if (year) {
      const val = parseInt(year);
      if (Number.isFinite(val))
        conditions.push(eq(cameras.yearIntroduced, val));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      name: cameras.name,
      system: systems.name,
      year: cameras.yearIntroduced,
      megapixels: cameras.megapixels,
      weight: cameras.weightG,
    };
    const sortCol = sortColumns[sort || ""] || cameras.name;
    const orderFn = order === "desc" ? desc : asc;

    const needsSystemJoin = !!system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(cameras)
          .leftJoin(systems, eq(cameras.systemId, systems.id))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(cameras)
          .where(where);
    const total = Number(countResult.count);

    const items = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    return NextResponse.json({ items, nextCursor, total });
  } catch (error) {
    console.error("GET /api/cameras error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
