import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, lensRatings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getClientIP, hashIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.ratings.limit(ip);
    if (!success) return rateLimitedResponse();

    const { searchParams } = request.nextUrl;
    const lensId = parseInt(searchParams.get("lensId") || "");
    if (!lensId || !Number.isFinite(lensId))
      return NextResponse.json(
        { error: "lensId required" },
        { status: 400 }
      );

    const ipHash = await hashIP(ip);

    const [lens] = await db
      .select({
        averageRating: lenses.averageRating,
        ratingCount: lenses.ratingCount,
      })
      .from(lenses)
      .where(eq(lenses.id, lensId));

    const [userRow] = await db
      .select({ rating: lensRatings.rating })
      .from(lensRatings)
      .where(
        and(eq(lensRatings.lensId, lensId), eq(lensRatings.ipHash, ipHash))
      );

    return NextResponse.json({
      averageRating: lens?.averageRating ?? null,
      ratingCount: lens?.ratingCount ?? 0,
      userRating: userRow?.rating ?? null,
    });
  } catch (error) {
    console.error("GET /api/ratings error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.ratings.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json();
    const lensId = typeof body.lensId === "number" ? body.lensId : NaN;
    const rating = typeof body.rating === "number" ? body.rating : NaN;

    if (
      !Number.isInteger(lensId) ||
      lensId <= 0 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 10
    ) {
      return NextResponse.json(
        { error: "Invalid input: lensId must be a positive integer, rating must be an integer 1-10" },
        { status: 400 }
      );
    }

    const ipHash = await hashIP(ip);

    // Upsert rating
    await db
      .insert(lensRatings)
      .values({ lensId, ipHash, rating })
      .onConflictDoUpdate({
        target: [lensRatings.lensId, lensRatings.ipHash],
        set: { rating },
      });

    // Recalculate average
    const [stats] = await db
      .select({
        avg: sql<number>`avg(${lensRatings.rating})::real`,
        count: sql<number>`count(*)::integer`,
      })
      .from(lensRatings)
      .where(eq(lensRatings.lensId, lensId));

    await db
      .update(lenses)
      .set({
        averageRating: stats.avg,
        ratingCount: stats.count,
      })
      .where(eq(lenses.id, lensId));

    return NextResponse.json({
      averageRating: stats.avg,
      ratingCount: stats.count,
    });
  } catch (error) {
    console.error("POST /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to save rating" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.ratings.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json();
    const lensId = typeof body.lensId === "number" ? body.lensId : NaN;

    if (!Number.isInteger(lensId) || lensId <= 0) {
      return NextResponse.json(
        { error: "lensId must be a positive integer" },
        { status: 400 }
      );
    }

    const ipHash = await hashIP(ip);

    await db
      .delete(lensRatings)
      .where(
        and(eq(lensRatings.lensId, lensId), eq(lensRatings.ipHash, ipHash))
      );

    // Recalculate average
    const [stats] = await db
      .select({
        avg: sql<number>`avg(${lensRatings.rating})::real`,
        count: sql<number>`count(*)::integer`,
      })
      .from(lensRatings)
      .where(eq(lensRatings.lensId, lensId));

    await db
      .update(lenses)
      .set({
        averageRating: stats.count > 0 ? stats.avg : null,
        ratingCount: stats.count,
      })
      .where(eq(lenses.id, lensId));

    return NextResponse.json({
      averageRating: stats.count > 0 ? stats.avg : null,
      ratingCount: stats.count,
    });
  } catch (error) {
    console.error("DELETE /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to delete rating" },
      { status: 500 }
    );
  }
}
