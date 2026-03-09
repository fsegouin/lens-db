import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, lensRatings, cameras, cameraRatings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getClientIP, hashIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

type EntityType = "lens" | "camera";

function getConfig(type: EntityType) {
  if (type === "camera") {
    return {
      ratingsTable: cameraRatings,
      entityTable: cameras,
      fkColumn: cameraRatings.cameraId,
      entityIdColumn: cameras.id,
      avgColumn: cameras.averageRating,
      countColumn: cameras.ratingCount,
      ratingColumn: cameraRatings.rating,
      ipColumn: cameraRatings.ipHash,
      conflictTarget: [cameraRatings.cameraId, cameraRatings.ipHash],
      paramName: "cameraId" as const,
    };
  }
  return {
    ratingsTable: lensRatings,
    entityTable: lenses,
    fkColumn: lensRatings.lensId,
    entityIdColumn: lenses.id,
    avgColumn: lenses.averageRating,
    countColumn: lenses.ratingCount,
    ratingColumn: lensRatings.rating,
    ipColumn: lensRatings.ipHash,
    conflictTarget: [lensRatings.lensId, lensRatings.ipHash],
    paramName: "lensId" as const,
  };
}

function parseType(value: string | null): EntityType {
  return value === "camera" ? "camera" : "lens";
}

function parseEntityId(body: Record<string, unknown>): number {
  // Accept entityId, lensId, or cameraId
  const raw = body.entityId ?? body.lensId ?? body.cameraId;
  return typeof raw === "number" ? raw : NaN;
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.ratings.limit(ip);
    if (!success) return rateLimitedResponse();

    const { searchParams } = request.nextUrl;
    const type = parseType(searchParams.get("type"));
    const entityId = parseInt(searchParams.get("entityId") || searchParams.get("lensId") || searchParams.get("cameraId") || "");
    if (!entityId || !Number.isFinite(entityId))
      return NextResponse.json(
        { error: "entityId required" },
        { status: 400 }
      );

    const cfg = getConfig(type);
    const ipHash = await hashIP(ip);

    const [entity] = await db
      .select({
        averageRating: cfg.avgColumn,
        ratingCount: cfg.countColumn,
      })
      .from(cfg.entityTable)
      .where(eq(cfg.entityIdColumn, entityId));

    const [userRow] = await db
      .select({ rating: cfg.ratingColumn })
      .from(cfg.ratingsTable)
      .where(
        and(eq(cfg.fkColumn, entityId), eq(cfg.ipColumn, ipHash))
      );

    return NextResponse.json({
      averageRating: entity?.averageRating ?? null,
      ratingCount: entity?.ratingCount ?? 0,
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
    const type = parseType(body.type);
    const entityId = parseEntityId(body);
    const rating = typeof body.rating === "number" ? body.rating : NaN;

    if (
      !Number.isInteger(entityId) ||
      entityId <= 0 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 10
    ) {
      return NextResponse.json(
        { error: "Invalid input: entityId must be a positive integer, rating must be an integer 1-10" },
        { status: 400 }
      );
    }

    const cfg = getConfig(type);
    const ipHash = await hashIP(ip);

    // Upsert rating
    await db
      .insert(cfg.ratingsTable)
      .values({ [cfg.paramName]: entityId, ipHash, rating } as never)
      .onConflictDoUpdate({
        target: cfg.conflictTarget,
        set: { rating },
      });

    // Recalculate average
    const [stats] = await db
      .select({
        avg: sql<number>`avg(${cfg.ratingColumn})::real`,
        count: sql<number>`count(*)::integer`,
      })
      .from(cfg.ratingsTable)
      .where(eq(cfg.fkColumn, entityId));

    await db
      .update(cfg.entityTable)
      .set({
        averageRating: stats.avg,
        ratingCount: stats.count,
      } as never)
      .where(eq(cfg.entityIdColumn, entityId));

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
    const type = parseType(body.type);
    const entityId = parseEntityId(body);

    if (!Number.isInteger(entityId) || entityId <= 0) {
      return NextResponse.json(
        { error: "entityId must be a positive integer" },
        { status: 400 }
      );
    }

    const cfg = getConfig(type);
    const ipHash = await hashIP(ip);

    await db
      .delete(cfg.ratingsTable)
      .where(
        and(eq(cfg.fkColumn, entityId), eq(cfg.ipColumn, ipHash))
      );

    // Recalculate average
    const [stats] = await db
      .select({
        avg: sql<number>`avg(${cfg.ratingColumn})::real`,
        count: sql<number>`count(*)::integer`,
      })
      .from(cfg.ratingsTable)
      .where(eq(cfg.fkColumn, entityId));

    await db
      .update(cfg.entityTable)
      .set({
        averageRating: stats.count > 0 ? stats.avg : null,
        ratingCount: stats.count,
      } as never)
      .where(eq(cfg.entityIdColumn, entityId));

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
