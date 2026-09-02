import { NextRequest, NextResponse } from "next/server";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { lenses, cameras } from "@/db/schema";
import { getEntityPriceEstimate, getEntityPriceHistory } from "@/lib/prices";
import { getLensBySlug } from "@/lib/lenses";
import { getCameraBySlug } from "@/lib/cameras";
import { isCronAuthorized } from "@/lib/api-utils";

export const maxDuration = 300;

// Fills the per-entity price and by-slug Data Caches in batches so page
// renders serve without touching Postgres. Run after a deploy that
// cold-starts the caches: GET ?entityType=lens|camera&offset=N&limit=M
// until the response reports done: true.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get("entityType") === "camera" ? "camera" : "lens";
  const rawOffset = parseInt(searchParams.get("offset") || "0");
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
  const rawLimit = parseInt(searchParams.get("limit") || "500");
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 500, 1), 1000);

  try {
    const table = entityType === "camera" ? cameras : lenses;
    const rows = await db
      .select({ id: table.id, slug: table.slug })
      .from(table)
      .where(isNull(table.mergedIntoId))
      .orderBy(table.id)
      .offset(offset)
      .limit(limit);

    // Each entity fans out to 3 DB reads on a cold cache; keep in-flight queries
// within the per-instance pg pool (4 clients) so waiters do not time out.
const CONCURRENCY = 4;
    let warmed = 0;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(
        rows.slice(i, i + CONCURRENCY).map(async (r) => {
          await Promise.all([
            getEntityPriceEstimate(entityType, r.id),
            getEntityPriceHistory(entityType, r.id),
            entityType === "camera" ? getCameraBySlug(r.slug) : getLensBySlug(r.slug),
          ]);
          warmed++;
        }),
      );
    }

    return NextResponse.json({
      entityType,
      offset,
      scanned: rows.length,
      warmed,
      done: rows.length < limit,
    });
  } catch (err) {
    console.error("Failed to warm price caches:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
