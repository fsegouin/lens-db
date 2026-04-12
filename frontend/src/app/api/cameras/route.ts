import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, systems, priceEstimates } from "@/db/schema";
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
  const q = searchParams.get("q")?.slice(0, 200) || undefined;
  const system = searchParams.get("system") || undefined;
  const type = searchParams.get("type") || undefined;
  const model = searchParams.get("model") || undefined;
  const filmType = searchParams.get("filmType") || undefined;
  const sensorType = searchParams.get("sensorType") || undefined;
  const cropFactor = searchParams.get("cropFactor") || undefined;
  const year = searchParams.get("year") || undefined;
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

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      name: cameras.name,
      system: systems.name,
      year: cameras.yearIntroduced,
      megapixels: cameras.megapixels,
      weight: cameras.weightG,
      price: avgPrice,
    };
    const sortKey = sort || "";
    const sortCol = sortColumns[sortKey] || cameras.name;
    const orderFn = order === "desc" ? desc : asc;
    // For price sorting, push NULLs to the end
    const nullsLast = sortKey === "price"
      ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
      : [orderFn(sortCol)];

    const baseQuery = db
      .select({ camera: cameras, system: systems, avgPrice: avgPrice })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id),
      ));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id),
      ))
      .where(where);
    const total = Number(countResult.count);

    const items = await baseQuery
      .where(where)
      .orderBy(...nullsLast)
      .limit(PAGE_SIZE)
      .offset(cursor);

    const nextCursor = cursor + PAGE_SIZE < total ? cursor + PAGE_SIZE : null;

    return NextResponse.json({ items, nextCursor, total });
  } catch (error) {
    console.error("GET /api/cameras error:", error);
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }
}
