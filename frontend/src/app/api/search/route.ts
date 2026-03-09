import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, systems, collections } from "@/db/schema";
import { and, or } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { buildNameSearch } from "@/lib/search";

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ lenses: [], cameras: [], systems: [], collections: [] });
  }

  const lensWhere = buildNameSearch(lenses.name, q);
  const cameraNameWhere = buildNameSearch(cameras.name, q);
  const cameraAliasWhere = buildNameSearch(cameras.alias, q);
  const systemNameWhere = buildNameSearch(systems.name, q);
  const systemMfrWhere = buildNameSearch(systems.manufacturer, q);
  const collectionWhere = buildNameSearch(collections.name, q);

  const [lensResults, cameraResults, systemResults, collectionResults] =
    await Promise.all([
      lensWhere.length > 0
        ? db
            .select({ id: lenses.id, name: lenses.name, slug: lenses.slug })
            .from(lenses)
            .where(and(...lensWhere))
            .limit(5)
        : [],
      cameraNameWhere.length > 0 || cameraAliasWhere.length > 0
        ? db
            .select({ id: cameras.id, name: cameras.name, slug: cameras.slug })
            .from(cameras)
            .where(
              or(
                cameraNameWhere.length > 0 ? and(...cameraNameWhere) : undefined,
                cameraAliasWhere.length > 0 ? and(...cameraAliasWhere) : undefined
              )
            )
            .limit(5)
        : [],
      systemNameWhere.length > 0 || systemMfrWhere.length > 0
        ? db
            .select({ id: systems.id, name: systems.name, slug: systems.slug })
            .from(systems)
            .where(
              or(
                systemNameWhere.length > 0 ? and(...systemNameWhere) : undefined,
                systemMfrWhere.length > 0 ? and(...systemMfrWhere) : undefined
              )
            )
            .limit(5)
        : [],
      collectionWhere.length > 0
        ? db
            .select({
              id: collections.id,
              name: collections.name,
              slug: collections.slug,
            })
            .from(collections)
            .where(and(...collectionWhere))
            .limit(5)
        : [],
    ]);

  return NextResponse.json({
    lenses: lensResults,
    cameras: cameraResults,
    systems: systemResults,
    collections: collectionResults,
  });
}
