import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { revalidateEntity } from "@/lib/revalidate-entity";
import { eq, inArray } from "drizzle-orm";
import { normalizeSensorSize } from "@/lib/sensor-size";
import { normalizeBodyType } from "@/lib/body-type";

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
      if (field === "sensorSize" || field === "bodyType") {
        // The label depends on whether each body is digital, so the same
        // form value can land as "Full frame" on one row and "35mm" on
        // another, or as "DSLR" on one and "SLR" on another.
        const rows = await db
          .select({ id: cameras.id, megapixels: cameras.megapixels })
          .from(cameras)
          .where(inArray(cameras.id, ids));
        for (const row of rows) {
          const set =
            field === "sensorSize"
              ? { sensorSize: normalizeSensorSize(fieldValue, row.megapixels) }
              : { bodyType: normalizeBodyType(fieldValue, row.megapixels) };
          await db.update(cameras).set(set).where(eq(cameras.id, row.id));
        }
      } else {
        await db.update(cameras).set({ [field]: fieldValue || null }).where(inArray(cameras.id, ids));
      }
      revalidateEntity("camera");
      return NextResponse.json({ success: true, affected: ids.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
