import { NextRequest, NextResponse } from "next/server";
import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses, cameras } from "@/db/schema";
import { recomputePriceEstimates } from "@/lib/price-pipeline";
import { isCronAuthorized } from "@/lib/api-utils";

export const maxDuration = 300;

// Re-derives price estimates for entities that absorbed a duplicate.
//
// Merging a duplicate moves its price_history rows onto the survivor, which
// changes the evidence an estimate was computed from without touching
// price_history.extracted_at, so nothing else notices. The eBay cron only
// recomputes entities it has just scraped, so a survivor keeps a stale range
// until it happens to sell again. Run this after any merge:
// GET ?entityType=lens|camera&offset=N&limit=M until done: true.
// Pass ids=1,2,3 instead to re-derive a specific set, which is what a change
// to the estimator's own rules needs.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get("entityType") === "camera" ? "camera" : "lens";
  const rawOffset = parseInt(searchParams.get("offset") || "0");
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
  const rawLimit = parseInt(searchParams.get("limit") || "100");
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);

  // An explicit list wins, for re-deriving a known set after a rule change.
  const explicit = (searchParams.get("ids") || "")
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  try {
    const table = entityType === "camera" ? cameras : lenses;

    let ids: number[];
    let pageSize: number;

    if (explicit.length > 0) {
      ids = explicit;
      pageSize = explicit.length;
    } else {
      // The survivors: every id some other row was merged into.
      const rows = await db
        .selectDistinct({ id: table.mergedIntoId })
        .from(table)
        .where(isNotNull(table.mergedIntoId))
        .orderBy(sql`1`)
        .offset(offset)
        .limit(limit);

      ids = rows.map((r) => r.id).filter((id): id is number => id != null);
      pageSize = rows.length;
    }

    // Each recompute is two reads plus a write; stay within the pg pool.
    const CONCURRENCY = 4;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      await Promise.all(
        ids.slice(i, i + CONCURRENCY).map((id) =>
          recomputePriceEstimates(entityType, id),
        ),
      );
    }

    return NextResponse.json({
      entityType,
      offset,
      limit,
      recomputed: ids.length,
      done: explicit.length > 0 || pageSize < limit,
    });
  } catch (error) {
    console.error("recompute-prices failed:", error);
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
