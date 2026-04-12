import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { inArray } from "drizzle-orm";

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
    case "setField": {
      const { field, fieldValue } = value as { field: string; fieldValue: unknown };
      const allowedFields = ["bodyType", "sensorType", "sensorSize"] as const;
      if (!allowedFields.includes(field as typeof allowedFields[number])) {
        return NextResponse.json({ error: `Field "${field}" is not allowed for bulk edit` }, { status: 400 });
      }
      await db.update(cameras).set({ [field]: fieldValue || null }).where(inArray(cameras.id, ids));
      return NextResponse.json({ success: true, affected: ids.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
