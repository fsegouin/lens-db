import { NextRequest, NextResponse } from "next/server";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { lenses, cameras, systems, collections } from "@/db/schema";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { buildNameSearch } from "@/lib/search";

type ResultRow = {
  id: number;
  name: string;
  slug: string;
  type: "lens" | "camera" | "system" | "collection";
};

function combine(conditions: SQL[]): SQL | null {
  if (conditions.length === 0) return null;
  return sql.join(conditions, sql` AND `);
}

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200);
  if (!q || q.length < 2) {
    return NextResponse.json({ lenses: [], cameras: [], systems: [], collections: [] });
  }

  const lensCond = combine(buildNameSearch(lenses.name, q));
  const cameraNameCond = combine(buildNameSearch(cameras.name, q));
  const cameraAliasCond = combine(buildNameSearch(cameras.alias, q));
  const systemNameCond = combine(buildNameSearch(systems.name, q));
  const systemMfrCond = combine(buildNameSearch(systems.manufacturer, q));
  const collectionCond = combine(buildNameSearch(collections.name, q));

  const branches: SQL[] = [];

  if (lensCond) {
    branches.push(sql`(SELECT id, name, slug, 'lens' AS type FROM ${lenses} WHERE ${lensCond} AND ${lenses.mergedIntoId} IS NULL LIMIT 5)`);
  }
  const cameraCond =
    cameraNameCond && cameraAliasCond
      ? sql`((${cameraNameCond}) OR (${cameraAliasCond}))`
      : (cameraNameCond ?? cameraAliasCond);
  if (cameraCond) {
    branches.push(sql`(SELECT id, name, slug, 'camera' AS type FROM ${cameras} WHERE ${cameraCond} AND ${cameras.mergedIntoId} IS NULL LIMIT 5)`);
  }
  const systemCond =
    systemNameCond && systemMfrCond
      ? sql`((${systemNameCond}) OR (${systemMfrCond}))`
      : (systemNameCond ?? systemMfrCond);
  if (systemCond) {
    branches.push(sql`(SELECT id, name, slug, 'system' AS type FROM ${systems} WHERE ${systemCond} LIMIT 5)`);
  }
  if (collectionCond) {
    branches.push(sql`(SELECT id, name, slug, 'collection' AS type FROM ${collections} WHERE ${collectionCond} LIMIT 5)`);
  }

  if (branches.length === 0) {
    return NextResponse.json({ lenses: [], cameras: [], systems: [], collections: [] });
  }

  const result = await db.execute(sql.join(branches, sql` UNION ALL `));
  const rows = result.rows as unknown as ResultRow[];

  const out = {
    lenses: [] as ResultRow[],
    cameras: [] as ResultRow[],
    systems: [] as ResultRow[],
    collections: [] as ResultRow[],
  };
  for (const row of rows) {
    if (row.type === "lens") out.lenses.push(row);
    else if (row.type === "camera") out.cameras.push(row);
    else if (row.type === "system") out.systems.push(row);
    else if (row.type === "collection") out.collections.push(row);
  }

  return NextResponse.json(out);
}
