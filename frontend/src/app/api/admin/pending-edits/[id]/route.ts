import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pendingEdits } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/user-auth";
import { applyPendingEditApproval, notifyEditReviewed } from "@/lib/pending-edits";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const editId = parseInt(id, 10);
  if (Number.isNaN(editId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !["approve", "reject"].includes(body.action)) {
    return NextResponse.json(
      { error: "Invalid action. Use 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  const [edit] = await db
    .select()
    .from(pendingEdits)
    .where(eq(pendingEdits.id, editId))
    .limit(1);

  if (!edit) {
    return NextResponse.json({ error: "Pending edit not found" }, { status: 404 });
  }

  if (edit.status !== "pending") {
    return NextResponse.json(
      { error: "This edit has already been reviewed" },
      { status: 400 }
    );
  }

  if (body.action === "reject") {
    await db
      .update(pendingEdits)
      .set({
        status: "rejected",
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        rejectReason: body.reason || null,
      })
      .where(eq(pendingEdits.id, editId));

    await notifyEditReviewed(edit, { status: "rejected", reason: body.reason || null }, admin.id);

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // Approve: apply the changes to the entity
  const result = await applyPendingEditApproval(edit, admin.id);

  if (!result.ok) {
    if (result.reason === "entity_missing") {
      return NextResponse.json(
        { error: "Entity no longer exists. Edit has been rejected." },
        { status: 404 }
      );
    }
    if (result.reason === "missing_name") {
      return NextResponse.json({ error: "New entity must have a name" }, { status: 400 });
    }
    return NextResponse.json({ error: "No valid changes in this edit" }, { status: 400 });
  }

  await notifyEditReviewed(edit, { status: "approved", entityId: result.entityId }, admin.id);

  return NextResponse.json({ success: true, action: "approved" });
}
