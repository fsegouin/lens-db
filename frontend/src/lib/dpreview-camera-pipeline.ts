import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import { cameras, pendingEdits, systems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createRevision } from "@/lib/revisions";
import { findSystemId } from "@/lib/dpreview-import";
import { getBotUserId, uploadCandidateImages } from "@/lib/dpreview-pipeline";
import {
  cameraMountString,
  mapDpreviewCameraSpecs,
  type DpreviewCameraCandidate,
} from "@/lib/dpreview-camera-import";

/**
 * Shared server-side steps of the camera half of the DPReview watcher:
 * queueing a new body for review, and enriching an existing body confirmed as
 * the same product. The lens counterpart is dpreview-pipeline.ts.
 *
 * There is no createCameraVersion() to match createLensVersion(): a camera
 * generation is its own cameras row, not a member of a version group.
 *
 * Used by /api/cron/dpreview-cameras and /api/cron/dpreview-camera-review.
 */

/**
 * cameras.slug is unique (migration 0049), and an approval can land long
 * after the edit was queued, so the slug is disambiguated up front rather
 * than left to collide at approval time.
 */
async function uniqueCameraSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; ; i++) {
    const [existing] = await db
      .select({ id: cameras.id })
      .from(cameras)
      .where(eq(cameras.slug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${base}-${i}`;
  }
}

/**
 * Queue a genuinely-new camera as a pending edit (entityId 0 = new entity)
 * for admin approval.
 */
export async function createPendingCamera(
  candidate: DpreviewCameraCandidate,
): Promise<number> {
  const changes = mapDpreviewCameraSpecs(candidate);

  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems);
  // Fixed-lens compacts publish no mount, and correctly get a null system.
  changes.systemId = findSystemId(cameraMountString(candidate), allSystems);

  changes.slug = await uniqueCameraSlug(String(changes.slug));
  changes.images = await uploadCandidateImages(candidate, "cameras");

  // Drop null-valued fields so the review UI only shows what we actually know
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete changes[key];
  }

  const botUserId = await getBotUserId();
  const [pending] = await db
    .insert(pendingEdits)
    .values({
      entityType: "camera",
      entityId: 0, // 0 indicates a new entity creation
      changes,
      summary: `DPReview watcher: new camera "${candidate.name}" (${candidate.dpreviewUrl})`,
      userId: botUserId,
    })
    .returning({ id: pendingEdits.id });

  return pending.id;
}

// Scalar columns that enrichment may fill when the DB value is NULL
const FILLABLE_FIELDS = [
  "sensorType",
  "sensorSize",
  "megapixels",
  "resolution",
  "bodyType",
  "weightG",
  "yearIntroduced",
  "systemId",
] as const;

/**
 * Upsert DPReview data into an existing camera confirmed as the same product.
 * Conservative in the same way as enrichLensFromCandidate: fills NULL scalar
 * columns only, merges the specs jsonb with DB values winning, and replaces
 * images only when the DB ones are missing or point at the dead lens-db.com
 * host. Writes a revision and revalidates on change.
 */
export async function enrichCameraFromCandidate(
  cameraId: number,
  candidate: DpreviewCameraCandidate,
): Promise<{ enriched: boolean; fields: string[] }> {
  const [camera] = await db.select().from(cameras).where(eq(cameras.id, cameraId)).limit(1);
  if (!camera) return { enriched: false, fields: [] };

  const mapped = mapDpreviewCameraSpecs(candidate);
  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems);
  mapped.systemId = findSystemId(cameraMountString(candidate), allSystems);

  const updates: Record<string, unknown> = {};

  for (const field of FILLABLE_FIELDS) {
    if (camera[field] === null && mapped[field] !== null && mapped[field] !== undefined) {
      updates[field] = mapped[field];
    }
  }

  const dbSpecs = (camera.specs ?? {}) as Record<string, unknown>;
  const mergedSpecs = { ...candidate.specTable, ...dbSpecs };
  if (Object.keys(mergedSpecs).length > Object.keys(dbSpecs).length) {
    updates.specs = mergedSpecs;
  }

  const dbImages = (camera.images ?? []) as unknown[];
  const imagesBroken = dbImages.length === 0 || JSON.stringify(dbImages).includes("lens-db.com");
  if (imagesBroken && candidate.imageUrls.length > 0) {
    const uploaded = await uploadCandidateImages(candidate, "cameras");
    if (uploaded.length > 0) updates.images = uploaded;
  }

  const fields = Object.keys(updates);
  if (fields.length === 0) {
    return { enriched: false, fields: [] };
  }

  await db.update(cameras).set(updates).where(eq(cameras.id, cameraId));

  await createRevision({
    entityType: "camera",
    entityId: cameraId,
    summary: `DPReview watcher: enriched from ${candidate.dpreviewUrl}`,
    userId: await getBotUserId(),
    autoPatrol: true,
  });

  revalidatePath(`/cameras/${camera.slug}`);
  revalidateTag("cameras", "max");

  return { enriched: true, fields };
}
