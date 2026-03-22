import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensSeries, pendingEdits } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";
import { createRevision, type EntityType } from "@/lib/revisions";
import { validateEdit, getUserTier } from "@/lib/edit-validation";
import { getClientIP, hashIP } from "@/lib/api-utils";
import { eq } from "drizzle-orm";

const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

// Editable fields per entity type (excludes engagement/internal fields)
const editableFields: Record<EntityType, string[]> = {
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

// Text fields that should be normalized (empty string → null)
const textFieldSets: Record<EntityType, string[]> = {
  lens: ["url", "brand", "description", "lensType", "era", "productionStatus"],
  camera: ["url", "description", "alias", "sensorType", "sensorSize", "resolution", "bodyType"],
  system: ["manufacturer", "mountType", "description"],
  collection: ["description"],
  series: ["description"],
};

// Numeric fields that need Number() coercion
const numericFields = new Set([
  "systemId",
  "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
  "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
  "lensElements", "lensGroups", "diaphragmBlades",
  "yearIntroduced", "yearDiscontinued", "megapixels",
]);

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authResult = await requireUserAPI(token);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await request.json();
  const { entityType, entityId, summary, changes } = body as {
    entityType: string;
    entityId: number;
    summary: string;
    changes: Record<string, unknown>;
  };

  // Validate entity type
  if (!entityType || !(entityType in entityTables)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }
  const type = entityType as EntityType;

  if (!entityId || !Number.isInteger(entityId)) {
    return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });
  }

  if (!summary || typeof summary !== "string" || summary.trim().length < 3) {
    return NextResponse.json(
      { error: "Edit summary is required (minimum 3 characters)" },
      { status: 400 }
    );
  }

  if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  // Fetch current entity
  const table = entityTables[type];
  const [current] = await db
    .select()
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1);
  if (!current) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const currentData = current as Record<string, unknown>;

  // Build updates from allowed fields only
  const allowed = editableFields[type];
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (changes[field] !== undefined) {
      let val = changes[field];
      if (numericFields.has(field)) {
        val = val != null && val !== "" ? Number(val) : null;
      }
      updates[field] = val;
    }
  }

  // Normalize empty strings to null
  const textFields = textFieldSets[type];
  for (const field of textFields) {
    if (updates[field] === "") updates[field] = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid changes provided" }, { status: 400 });
  }

  // Validate the edit
  const validationError = await validateEdit({
    user,
    entityType: type,
    protectionLevel: currentData.protectionLevel as string | null,
    newData: { ...currentData, ...updates },
    oldData: currentData,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 403 });
  }

  const ipHash = await hashIP(getClientIP(request));
  const userTier = getUserTier(user);
  const canAutoApply = userTier !== "none";

  if (!canAutoApply) {
    // Queue the edit for admin review
    const [pending] = await db
      .insert(pendingEdits)
      .values({
        entityType: type,
        entityId,
        changes: updates,
        summary: summary.trim(),
        userId: user.id,
        ipHash,
      })
      .returning({ id: pendingEdits.id });

    return NextResponse.json({
      success: true,
      pending: true,
      pendingEditId: pending.id,
      message: "Your edit has been submitted for review. An admin will approve it shortly.",
    });
  }

  // Apply the update immediately for autoconfirmed/trusted/admin users
  await db.update(table).set(updates).where(eq(table.id, entityId));

  const isAdmin = user.role === "admin";
  const isTrusted = user.role === "trusted";

  const revision = await createRevision({
    entityType: type,
    entityId,
    summary: summary.trim(),
    userId: user.id,
    ipHash,
    autoPatrol: isAdmin || isTrusted,
  });

  return NextResponse.json({
    success: true,
    pending: false,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
  });
}
