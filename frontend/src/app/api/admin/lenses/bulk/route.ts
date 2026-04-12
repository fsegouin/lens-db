import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, lensTags, tags, lensSeriesMemberships, lensSeries } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { and, eq, inArray } from "drizzle-orm";

const MAX_IDS = 200;

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { ids, action, value } = body as {
    ids: number[];
    action: string;
    value: unknown;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Max ${MAX_IDS} items per bulk operation` }, { status: 400 });
  }

  switch (action) {
    case "addTags": {
      const tagIds = value as number[];
      if (!Array.isArray(tagIds) || tagIds.length === 0) {
        return NextResponse.json({ error: "No tags provided" }, { status: 400 });
      }
      // Verify tags exist
      const existingTags = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));
      if (existingTags.length !== tagIds.length) {
        return NextResponse.json({ error: "Some tags not found" }, { status: 400 });
      }
      // Insert tag associations (ignore conflicts)
      const rows = ids.flatMap((lensId) => tagIds.map((tagId) => ({ lensId, tagId })));
      await db.insert(lensTags).values(rows).onConflictDoNothing();
      return NextResponse.json({ success: true, affected: ids.length });
    }

    case "removeTags": {
      const tagIds = value as number[];
      if (!Array.isArray(tagIds) || tagIds.length === 0) {
        return NextResponse.json({ error: "No tags provided" }, { status: 400 });
      }
      await db.delete(lensTags).where(
        and(inArray(lensTags.lensId, ids), inArray(lensTags.tagId, tagIds))
      );
      return NextResponse.json({ success: true, affected: ids.length });
    }

    case "addToSeries": {
      const seriesId = value as number;
      if (!seriesId) {
        return NextResponse.json({ error: "No series provided" }, { status: 400 });
      }
      const [series] = await db.select({ id: lensSeries.id }).from(lensSeries).where(eq(lensSeries.id, seriesId));
      if (!series) {
        return NextResponse.json({ error: "Series not found" }, { status: 400 });
      }
      const rows = ids.map((lensId) => ({ lensId, seriesId }));
      await db.insert(lensSeriesMemberships).values(rows).onConflictDoNothing();
      return NextResponse.json({ success: true, affected: ids.length });
    }

    case "setField": {
      const { field, fieldValue } = value as { field: string; fieldValue: unknown };
      const allowedFields = ["brand", "era", "productionStatus", "lensType"] as const;
      if (!allowedFields.includes(field as typeof allowedFields[number])) {
        return NextResponse.json({ error: `Field "${field}" is not allowed for bulk edit` }, { status: 400 });
      }
      await db.update(lenses).set({ [field]: fieldValue || null }).where(inArray(lenses.id, ids));
      return NextResponse.json({ success: true, affected: ids.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
