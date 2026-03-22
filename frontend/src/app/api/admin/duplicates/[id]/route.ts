import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { duplicateFlags, lenses, cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const flagId = parseInt(id, 10);
  const body = await request.json();
  const { action, keepEntityId } = body as {
    action: "confirm" | "dismiss";
    keepEntityId?: number;
  };

  const [flag] = await db
    .select()
    .from(duplicateFlags)
    .where(eq(duplicateFlags.id, flagId))
    .limit(1);

  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    await db
      .update(duplicateFlags)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(duplicateFlags.id, flagId));
    return NextResponse.json({ success: true });
  }

  if (action === "confirm") {
    // Determine which entity to keep and which to merge
    const mergeId =
      keepEntityId === flag.sourceEntityId
        ? flag.targetEntityId
        : flag.sourceEntityId;
    const keepId =
      keepEntityId === flag.sourceEntityId
        ? flag.sourceEntityId
        : flag.targetEntityId;

    const table = flag.sourceEntityType === "lens" ? lenses : cameras;

    // Set mergedIntoId on the merged entity
    await db
      .update(table)
      .set({ mergedIntoId: keepId })
      .where(eq(table.id, mergeId));

    // Mark flag as confirmed
    await db
      .update(duplicateFlags)
      .set({ status: "confirmed", resolvedAt: new Date() })
      .where(eq(duplicateFlags.id, flagId));

    return NextResponse.json({ success: true, mergedId: mergeId, keptId: keepId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
