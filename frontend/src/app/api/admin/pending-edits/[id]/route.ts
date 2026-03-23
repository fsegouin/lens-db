import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  pendingEdits,
  lenses,
  cameras,
  systems,
  collections,
  lensSeries,
} from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/user-auth";
import { createRevision, type EntityType } from "@/lib/revisions";
import { eq } from "drizzle-orm";

const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

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
  if (isNaN(editId)) {
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

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // Approve: apply the changes to the entity
  const entityType = edit.entityType as EntityType;
  const table = entityTables[entityType];
  const rawChanges = edit.changes as Record<string, unknown>;

  // Re-validate changes against the allowed field list (defense in depth)
  const allowedFields: Record<string, string[]> = {
    lens: [
      "name", "url", "brand", "description", "lensType", "era", "productionStatus",
      "systemId",
      "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
      "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
      "lensElements", "lensGroups", "diaphragmBlades",
      "yearIntroduced", "yearDiscontinued",
      "isZoom", "isMacro", "isPrime", "hasStabilization", "hasAutofocus",
    ],
    camera: [
      "name", "url", "description", "alias",
      "systemId",
      "sensorType", "sensorSize", "megapixels", "resolution",
      "yearIntroduced", "bodyType", "weightG",
    ],
    system: ["name", "manufacturer", "mountType", "description"],
    collection: ["name", "description"],
    series: ["name", "description"],
  };
  const allowed = new Set(allowedFields[entityType] ?? []);
  const changes: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawChanges)) {
    if (allowed.has(key)) changes[key] = val;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No valid changes in this edit" }, { status: 400 });
  }

  // Verify entity still exists
  const [entity] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, edit.entityId))
    .limit(1);

  if (!entity) {
    await db
      .update(pendingEdits)
      .set({
        status: "rejected",
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        rejectReason: "Entity no longer exists",
      })
      .where(eq(pendingEdits.id, editId));
    return NextResponse.json(
      { error: "Entity no longer exists. Edit has been rejected." },
      { status: 404 }
    );
  }

  // Apply the update
  await db.update(table).set(changes).where(eq(table.id, edit.entityId));

  // Create revision attributed to the original submitter
  await createRevision({
    entityType,
    entityId: edit.entityId,
    summary: edit.summary,
    userId: edit.userId,
    ipHash: edit.ipHash,
    autoPatrol: true, // Admin-approved edits are auto-patrolled
  });

  // Increment submitter's edit count (createRevision already does this, but
  // the pending edit didn't count yet — createRevision handles it)

  // Mark as approved
  await db
    .update(pendingEdits)
    .set({
      status: "approved",
      reviewedByUserId: admin.id,
      reviewedAt: new Date(),
    })
    .where(eq(pendingEdits.id, editId));

  return NextResponse.json({ success: true, action: "approved" });
}
