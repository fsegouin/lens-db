import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { duplicateFlags, lenses, cameras } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";
import { createRateLimit } from "@/lib/rate-limit";
import { eq, and } from "drizzle-orm";

const validTypes = new Set(["lens", "camera"]);
const flagLimiter = createRateLimit(10, "3600 s"); // 10 flags per hour

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authResult = await requireUserAPI(token);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  // Rate limit per user
  const { success: rateLimitOk } = await flagLimiter.limit(`dup-flag:${user.id}`);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many flags. Please wait before flagging again." }, { status: 429 });
  }

  const body = await request.json();
  const { sourceEntityType, sourceEntityId, targetEntityType, targetEntityId, reason } = body;

  if (!validTypes.has(sourceEntityType) || !validTypes.has(targetEntityType)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }

  if (sourceEntityType !== targetEntityType) {
    return NextResponse.json({ error: "Source and target must be the same type" }, { status: 400 });
  }

  // Validate IDs are integers
  if (!Number.isInteger(sourceEntityId) || !Number.isInteger(targetEntityId)) {
    return NextResponse.json({ error: "Invalid entity IDs" }, { status: 400 });
  }

  if (sourceEntityId === targetEntityId) {
    return NextResponse.json({ error: "Cannot flag an entity as a duplicate of itself" }, { status: 400 });
  }

  // Validate reason length
  if (reason && (typeof reason !== "string" || reason.length > 1000)) {
    return NextResponse.json({ error: "Reason must be under 1000 characters" }, { status: 400 });
  }

  // Check for existing pending flag for this pair (either direction)
  const [existingFlag] = await db
    .select({ id: duplicateFlags.id })
    .from(duplicateFlags)
    .where(
      and(
        eq(duplicateFlags.sourceEntityType, sourceEntityType),
        eq(duplicateFlags.sourceEntityId, sourceEntityId),
        eq(duplicateFlags.targetEntityId, targetEntityId),
        eq(duplicateFlags.status, "pending")
      )
    )
    .limit(1);

  if (existingFlag) {
    return NextResponse.json({ error: "This pair has already been flagged as duplicates" }, { status: 409 });
  }

  // Verify both entities exist
  const table = sourceEntityType === "lens" ? lenses : cameras;
  const [source] = await db.select({ id: table.id }).from(table).where(eq(table.id, sourceEntityId)).limit(1);
  const [target] = await db.select({ id: table.id }).from(table).where(eq(table.id, targetEntityId)).limit(1);

  if (!source || !target) {
    return NextResponse.json({ error: "One or both entities not found" }, { status: 404 });
  }

  const [flag] = await db
    .insert(duplicateFlags)
    .values({
      sourceEntityType,
      sourceEntityId,
      targetEntityType,
      targetEntityId,
      reason: reason ? reason.slice(0, 1000) : null,
      flaggedByUserId: user.id,
    })
    .returning();

  return NextResponse.json({ success: true, flagId: flag.id });
}
