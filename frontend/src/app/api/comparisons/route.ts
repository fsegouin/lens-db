import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lensComparisons } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const MAX_TOP = 50;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.comparisons.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json();
    let lensId1 = typeof body.lensId1 === "number" ? body.lensId1 : NaN;
    let lensId2 = typeof body.lensId2 === "number" ? body.lensId2 : NaN;

    if (
      !Number.isInteger(lensId1) ||
      lensId1 <= 0 ||
      !Number.isInteger(lensId2) ||
      lensId2 <= 0 ||
      lensId1 === lensId2
    ) {
      return NextResponse.json(
        { error: "Two different positive integer lens IDs required" },
        { status: 400 }
      );
    }

    // Ensure canonical order
    if (lensId1 > lensId2) [lensId1, lensId2] = [lensId2, lensId1];

    await db
      .insert(lensComparisons)
      .values({ lensId1, lensId2 })
      .onConflictDoUpdate({
        target: [lensComparisons.lensId1, lensComparisons.lensId2],
        set: {
          viewCount: sql`${lensComparisons.viewCount} + 1`,
          lastComparedAt: sql`NOW()`,
        },
      });

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

    // Use raw SQL for aliased self-joins
    const results = await db.execute(sql`
      SELECT
        c.id,
        c.view_count,
        c.last_compared_at,
        l1.id as lens1_id, l1.name as lens1_name, l1.slug as lens1_slug,
        l2.id as lens2_id, l2.name as lens2_name, l2.slug as lens2_slug
      FROM lens_comparisons c
      JOIN lenses l1 ON c.lens_id_1 = l1.id
      JOIN lenses l2 ON c.lens_id_2 = l2.id
      ORDER BY c.view_count DESC
      LIMIT ${limit}
    `);

    return NextResponse.json({ comparisons: results.rows });
  } catch (error) {
    console.error("GET /api/comparisons error:", error);
    return NextResponse.json({ comparisons: [] });
  }
}
