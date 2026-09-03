import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cameras, kitItems, lenses, users } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";
import {
  getKitItems,
  isInKit,
  kitValue,
  KIT_CONDITIONS,
  type KitEntityType,
} from "@/lib/kit";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const SESSION_COOKIE = "user_session";

function isEntityType(v: unknown): v is KitEntityType {
  return v === "lens" || v === "camera";
}

/** The entity has to exist, and a merged one resolves to its survivor. */
async function resolveEntity(
  entityType: KitEntityType,
  entityId: number,
): Promise<number | null> {
  if (entityType === "lens") {
    const [row] = await db
      .select({ id: lenses.id, mergedIntoId: lenses.mergedIntoId })
      .from(lenses)
      .where(eq(lenses.id, entityId))
      .limit(1);
    return row ? (row.mergedIntoId ?? row.id) : null;
  }
  const [row] = await db
    .select({ id: cameras.id, mergedIntoId: cameras.mergedIntoId })
    .from(cameras)
    .where(eq(cameras.id, entityId))
    .limit(1);
  return row ? (row.mergedIntoId ?? row.id) : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  // The "I own this" button asks about one entity; everything else wants the
  // whole kit. Answering the narrow question narrowly keeps that button from
  // pulling a full kit and its price estimates on every entity page.
  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get("entityType");
  const entityId = parseInt(searchParams.get("entityId") || "");
  if (isEntityType(entityType) && Number.isFinite(entityId)) {
    return NextResponse.json({
      inKit: await isInKit(auth.user.id, entityType, entityId),
    });
  }

  const items = await getKitItems(auth.user.id);
  return NextResponse.json({ items, value: kitValue(items) });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  const { success } = await rateLimiters.ratings.limit(getClientIP(request));
  if (!success) return rateLimitedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entityType, entityId } = body;
  if (!isEntityType(entityType) || typeof entityId !== "number") {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const resolvedId = await resolveEntity(entityType, entityId);
  if (resolvedId == null) {
    return NextResponse.json({ error: "No such lens or camera" }, { status: 404 });
  }

  try {
    await db
      .insert(kitItems)
      .values({ userId: auth.user.id, entityType, entityId: resolvedId })
      .onConflictDoNothing({
        target: [kitItems.userId, kitItems.entityType, kitItems.entityId],
      });
    revalidateTag("kit", "max");
    return NextResponse.json({ ok: true, entityType, entityId: resolvedId });
  } catch (error) {
    console.error("POST /api/kit error:", error);
    return NextResponse.json({ error: "Could not add to kit" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "number" ? body.id : null;
  if (id == null) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 999) {
      return NextResponse.json({ error: "quantity must be 1 to 999" }, { status: 400 });
    }
    updates.quantity = q;
  }
  if (body.condition !== undefined) {
    const c = body.condition;
    if (c !== null && !KIT_CONDITIONS.includes(c as (typeof KIT_CONDITIONS)[number])) {
      return NextResponse.json({ error: "Unknown condition" }, { status: 400 });
    }
    updates.condition = c;
  }
  if (body.acquiredPriceUsd !== undefined) {
    const p = body.acquiredPriceUsd;
    if (p !== null) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        return NextResponse.json({ error: "acquiredPriceUsd out of range" }, { status: 400 });
      }
      updates.acquiredPriceUsd = n;
    } else {
      updates.acquiredPriceUsd = null;
    }
  }
  if (body.serialNumber !== undefined) {
    updates.serialNumber =
      typeof body.serialNumber === "string" ? body.serialNumber.slice(0, 100) || null : null;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) || null : null;
  }
  if (body.acquiredOn !== undefined) {
    const d = body.acquiredOn;
    updates.acquiredOn =
      typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }

  try {
    // Scoped to the owner, so an id from another account updates nothing.
    const updated = await db
      .update(kitItems)
      .set(updates)
      .where(and(eq(kitItems.id, id), eq(kitItems.userId, auth.user.id)))
      .returning({ id: kitItems.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    revalidateTag("kit", "max");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/kit error:", error);
    return NextResponse.json({ error: "Could not update item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const id = parseInt(searchParams.get("id") || "");
  const entityType = searchParams.get("entityType");
  const entityId = parseInt(searchParams.get("entityId") || "");

  const where = Number.isFinite(id)
    ? and(eq(kitItems.id, id), eq(kitItems.userId, auth.user.id))
    : isEntityType(entityType) && Number.isFinite(entityId)
      ? and(
          eq(kitItems.userId, auth.user.id),
          eq(kitItems.entityType, entityType),
          eq(kitItems.entityId, entityId),
        )
      : null;

  if (!where) {
    return NextResponse.json({ error: "id or entityType+entityId required" }, { status: 400 });
  }

  try {
    await db.delete(kitItems).where(where);
    revalidateTag("kit", "max");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/kit error:", error);
    return NextResponse.json({ error: "Could not remove item" }, { status: 500 });
  }
}

/** Publishing or unpublishing the kit. */
export async function PUT(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.kitIsPublic !== "boolean") {
    return NextResponse.json({ error: "kitIsPublic must be a boolean" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ kitIsPublic: body.kitIsPublic })
    .where(eq(users.id, auth.user.id));
  revalidateTag("kit", "max");
  return NextResponse.json({ ok: true, kitIsPublic: body.kitIsPublic });
}
