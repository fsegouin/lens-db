import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { revisions } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { revertToRevision } from "@/lib/revisions";
import { eq, and } from "drizzle-orm";

// Patrol or revert a revision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const revisionId = parseInt(id, 10);
  if (isNaN(revisionId)) {
    return NextResponse.json({ error: "Invalid revision ID" }, { status: 400 });
  }

  const body = await request.json();
  const { action } = body as { action: "patrol" | "revert" };

  if (action === "patrol") {
    const [updated] = await db
      .update(revisions)
      .set({
        isPatrolled: true,
        patrolledAt: new Date(),
      })
      .where(eq(revisions.id, revisionId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "revert") {
    const [current] = await db
      .select()
      .from(revisions)
      .where(eq(revisions.id, revisionId))
      .limit(1);

    if (!current) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }

    if (current.revisionNumber <= 1) {
      return NextResponse.json(
        { error: "Cannot revert the initial revision" },
        { status: 400 }
      );
    }

    // Find the revision before this one and revert to it
    const [prev] = await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.entityType, current.entityType),
          eq(revisions.entityId, current.entityId),
          eq(revisions.revisionNumber, current.revisionNumber - 1)
        )
      )
      .limit(1);

    if (!prev) {
      return NextResponse.json(
        { error: "Previous revision not found" },
        { status: 404 }
      );
    }

    const newRevision = await revertToRevision(prev.id, 0);
    return NextResponse.json({ success: true, revisionId: newRevision.id });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
