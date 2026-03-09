import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lensComparisons, cameraComparisons } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const MAX_TOP = 50;

type ComparisonType = "lens" | "camera";

function isValidType(value: unknown): value is ComparisonType {
  return value === "lens" || value === "camera";
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.comparisons.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json();
    const type: ComparisonType = isValidType(body.type) ? body.type : "lens";
    let id1 = typeof body.id1 === "number" ? body.id1 : NaN;
    let id2 = typeof body.id2 === "number" ? body.id2 : NaN;

    if (
      !Number.isInteger(id1) ||
      id1 <= 0 ||
      !Number.isInteger(id2) ||
      id2 <= 0 ||
      id1 === id2
    ) {
      return NextResponse.json(
        { error: "Two different positive integer IDs required" },
        { status: 400 }
      );
    }

    // Ensure canonical order
    if (id1 > id2) [id1, id2] = [id2, id1];

    if (type === "camera") {
      await db
        .insert(cameraComparisons)
        .values({ cameraId1: id1, cameraId2: id2 })
        .onConflictDoUpdate({
          target: [cameraComparisons.cameraId1, cameraComparisons.cameraId2],
          set: {
            viewCount: sql`${cameraComparisons.viewCount} + 1`,
            lastComparedAt: sql`NOW()`,
          },
        });
    } else {
      await db
        .insert(lensComparisons)
        .values({ lensId1: id1, lensId2: id2 })
        .onConflictDoUpdate({
          target: [lensComparisons.lensId1, lensComparisons.lensId2],
          set: {
            viewCount: sql`${lensComparisons.viewCount} + 1`,
            lastComparedAt: sql`NOW()`,
          },
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/comparisons error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.comparisons.limit(ip);
    if (!success) return rateLimitedResponse();

    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get("top") || "10");
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), MAX_TOP);
    const type: ComparisonType = isValidType(searchParams.get("type"))
      ? (searchParams.get("type") as ComparisonType)
      : "lens";

    if (type === "camera") {
      const results = await db.execute(sql`
        SELECT
          c.id,
          c.view_count,
          c.last_compared_at,
          c1.id as item1_id, c1.name as item1_name, c1.slug as item1_slug,
          c2.id as item2_id, c2.name as item2_name, c2.slug as item2_slug
        FROM camera_comparisons c
        JOIN cameras c1 ON c.camera_id_1 = c1.id
        JOIN cameras c2 ON c.camera_id_2 = c2.id
        ORDER BY c.view_count DESC
        LIMIT ${limit}
      `);

      const comparisons = results.rows.map((row) => ({ ...row, type: "camera" }));
      return NextResponse.json({ comparisons });
    }

    // Default: lens comparisons
    const results = await db.execute(sql`
      SELECT
        c.id,
        c.view_count,
        c.last_compared_at,
        l1.id as item1_id, l1.name as item1_name, l1.slug as item1_slug,
        l2.id as item2_id, l2.name as item2_name, l2.slug as item2_slug
      FROM lens_comparisons c
      JOIN lenses l1 ON c.lens_id_1 = l1.id
      JOIN lenses l2 ON c.lens_id_2 = l2.id
      ORDER BY c.view_count DESC
      LIMIT ${limit}
    `);

    const comparisons = results.rows.map((row) => ({ ...row, type: "lens" }));
    return NextResponse.json({ comparisons });
  } catch (error) {
    console.error("GET /api/comparisons error:", error);
    return NextResponse.json({ comparisons: [] });
  }
}
