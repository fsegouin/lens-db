import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { duplicateFlags, lenses, cameras } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";
import { eq } from "drizzle-orm";

const validTypes = new Set(["lens", "camera"]);

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authResult = await requireUserAPI(token);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await request.json();
  const { sourceEntityType, sourceEntityId, targetEntityType, targetEntityId, reason } = body;

  if (!validTypes.has(sourceEntityType) || !validTypes.has(targetEntityType)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }

  if (sourceEntityType !== targetEntityType) {
    return NextResponse.json({ error: "Source and target must be the same type" }, { status: 400 });
  }

  if (sourceEntityId === targetEntityId) {
    return NextResponse.json({ error: "Cannot flag an entity as a duplicate of itself" }, { status: 400 });
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
      reason: reason || null,
      flaggedByUserId: user.id,
    })
    .returning();

  return NextResponse.json({ success: true, flagId: flag.id });
}
