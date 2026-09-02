import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  lenses,
  lensSystems,
  lensVersionGroups,
  pendingEdits,
  systems,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchAndUpload, objectExists, publicUrlFor } from "@/lib/r2-upload";
import { createRevision } from "@/lib/revisions";
import {
  DPREVIEW_BOT_DISPLAY_NAME,
  DPREVIEW_BOT_EMAIL,
  findAllSystemIds,
  findSystemId,
  generateSlug,
  mapDpreviewSpecs,
  type DpreviewCandidate,
} from "@/lib/dpreview-import";

/**
 * Shared server-side steps of the DPReview watcher: queueing a new lens for
 * review, enriching an existing lens confirmed as the same product, and
 * creating a new version of an existing lens.
 * Used by /api/cron/dpreview-lenses and /api/cron/dpreview-review.
 */

export async function getBotUserId(): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DPREVIEW_BOT_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: DPREVIEW_BOT_EMAIL,
      // Sentinel that can never match a PBKDF2 hash — the account is unloginable
      passwordHash: "!",
      displayName: DPREVIEW_BOT_DISPLAY_NAME,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;

  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DPREVIEW_BOT_EMAIL))
    .limit(1);
  if (!raced) {
    throw new Error(
      `DPReview bot user missing after conflicting insert — is the display name "${DPREVIEW_BOT_DISPLAY_NAME}" taken by another account?`,
    );
  }
  return raced.id;
}

function mountString(candidate: DpreviewCandidate): string | undefined {
  return candidate.specTable["Lens mount"] || candidate.mounts;
}

/**
 * Record mount availability (lens_systems junction) for every mount in the
 * candidate's DPReview mount list. Returns how many new rows were added.
 */
export async function linkLensSystems(
  lensId: number,
  candidate: DpreviewCandidate,
  allSystems: { id: number; name: string }[],
): Promise<number> {
  const systemIds = findAllSystemIds(mountString(candidate), allSystems);
  if (systemIds.length === 0) return 0;
  const inserted = await db
    .insert(lensSystems)
    .values(systemIds.map((systemId) => ({ lensId, systemId })))
    .onConflictDoNothing()
    .returning({ systemId: lensSystems.systemId });
  return inserted.length;
}

/**
 * Mirror candidate images to R2 (idempotent via HEAD-check). A failed image
 * never blocks the candidate.
 */
async function uploadCandidateImages(
  candidate: DpreviewCandidate,
): Promise<{ src: string; alt: string }[]> {
  const images: { src: string; alt: string }[] = [];
  for (let i = 0; i < candidate.imageUrls.length; i++) {
    const r2Key = `lenses/${candidate.dpreviewSlug}/${i + 1}.webp`;
    try {
      const src = (await objectExists(r2Key))
        ? publicUrlFor(r2Key)
        : await fetchAndUpload(candidate.imageUrls[i], r2Key);
      images.push({ src, alt: candidate.name });
    } catch (error) {
      console.error(`[dpreview] Image failed (${r2Key}):`, error);
    }
  }
  return images;
}

/**
 * Queue a genuinely-new lens as a pending edit (entityId 0 = new entity) for
 * admin approval. Mount junction rows are added by syncReviewedCandidates
 * once the edit is approved (from the registry's candidateData).
 */
export async function createPendingLens(candidate: DpreviewCandidate): Promise<number> {
  const changes = mapDpreviewSpecs(candidate);

  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems);
  changes.systemId = findSystemId(mountString(candidate), allSystems);

  changes.images = await uploadCandidateImages(candidate);

  // Drop null-valued fields so the review UI only shows what we actually know
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete changes[key];
  }

  const botUserId = await getBotUserId();
  const [pending] = await db
    .insert(pendingEdits)
    .values({
      entityType: "lens",
      entityId: 0, // 0 indicates a new entity creation
      changes,
      summary: `DPReview watcher: new lens "${candidate.name}" (${candidate.dpreviewUrl})`,
      userId: botUserId,
    })
    .returning({ id: pendingEdits.id });

  return pending.id;
}

// Scalar columns that enrichment may fill when the DB value is NULL
const FILLABLE_FIELDS = [
  "lensType",
  "focalLengthMin",
  "focalLengthMax",
  "apertureMin",
  "apertureMax",
  "weightG",
  "filterSizeMm",
  "minFocusDistanceM",
  "maxMagnification",
  "lensElements",
  "lensGroups",
  "diaphragmBlades",
  "yearIntroduced",
  "coverage",
  "systemId",
] as const;

/**
 * Upsert DPReview data into an existing lens confirmed as the same product.
 * Conservative: fills NULL scalar columns, upgrades autofocus/stabilization
 * only on an explicit "Yes" spec row, merges specs jsonb (DB values win),
 * records mount availability, and replaces images only when the DB ones are
 * missing or point at the dead lens-db.com host. Writes a revision and
 * revalidates on change.
 */
export async function enrichLensFromCandidate(
  lensId: number,
  candidate: DpreviewCandidate,
): Promise<{ enriched: boolean; fields: string[] }> {
  const [lens] = await db.select().from(lenses).where(eq(lenses.id, lensId)).limit(1);
  if (!lens) return { enriched: false, fields: [] };

  const mapped = mapDpreviewSpecs(candidate);
  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems);
  mapped.systemId = findSystemId(mountString(candidate), allSystems);

  const updates: Record<string, unknown> = {};

  for (const field of FILLABLE_FIELDS) {
    if (lens[field] === null && mapped[field] !== null && mapped[field] !== undefined) {
      updates[field] = mapped[field];
    }
  }

  if (!lens.hasAutofocus && candidate.specTable["Autofocus"] === "Yes") {
    updates.hasAutofocus = true;
  }
  if (!lens.hasStabilization && candidate.specTable["Image stabilization"] === "Yes") {
    updates.hasStabilization = true;
  }

  const dbSpecs = (lens.specs ?? {}) as Record<string, unknown>;
  const mergedSpecs = { ...candidate.specTable, ...dbSpecs };
  if (Object.keys(mergedSpecs).length > Object.keys(dbSpecs).length) {
    updates.specs = mergedSpecs;
  }

  const dbImages = (lens.images ?? []) as unknown[];
  const imagesBroken = dbImages.length === 0 || JSON.stringify(dbImages).includes("lens-db.com");
  if (imagesBroken && candidate.imageUrls.length > 0) {
    const uploaded = await uploadCandidateImages(candidate);
    if (uploaded.length > 0) updates.images = uploaded;
  }

  const mountsAdded = await linkLensSystems(lensId, candidate, allSystems);

  const fields = Object.keys(updates);
  if (mountsAdded > 0) fields.push("mounts");
  if (fields.length === 0) {
    return { enriched: false, fields: [] };
  }

  if (Object.keys(updates).length > 0) {
    await db.update(lenses).set(updates).where(eq(lenses.id, lensId));
  }

  await createRevision({
    entityType: "lens",
    entityId: lensId,
    summary: `DPReview watcher: enriched from ${candidate.dpreviewUrl}`,
    userId: await getBotUserId(),
    autoPatrol: true,
  });

  revalidatePath(`/lenses/${lens.slug}`);
  revalidateTag("lenses", "max");

  return { enriched: true, fields };
}

async function uniqueLensSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; ; i++) {
    const [existing] = await db
      .select({ id: lenses.id })
      .from(lenses)
      .where(eq(lenses.slug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${base}-${i}`;
  }
}

export interface VersionOptions {
  existingLabel?: string;
  newLabel?: string;
  renameExistingTo?: string;
}

/**
 * The candidate is a NEW VERSION of an existing lens (e.g. Type V vs Type IV):
 * links both into a version group, optionally labels/renames the existing lens
 * (name only — its slug is preserved), and creates the new version directly
 * with the scraped data and images. The manual CLI decision is the human gate.
 */
export async function createLensVersion(
  existingLensId: number,
  candidate: DpreviewCandidate,
  opts: VersionOptions,
): Promise<{ newLensId: number; newSlug: string; versionGroupId: number }> {
  const [existing] = await db
    .select()
    .from(lenses)
    .where(eq(lenses.id, existingLensId))
    .limit(1);
  if (!existing) throw new Error(`Lens ${existingLensId} not found`);

  let versionGroupId = existing.versionGroupId;
  if (!versionGroupId) {
    const [group] = await db
      .insert(lensVersionGroups)
      .values({ name: candidate.name })
      .returning({ id: lensVersionGroups.id });
    versionGroupId = group.id;
  }

  const existingUpdates: Record<string, unknown> = { versionGroupId };
  if (opts.existingLabel) existingUpdates.versionLabel = opts.existingLabel;
  if (opts.renameExistingTo) existingUpdates.name = opts.renameExistingTo;
  await db.update(lenses).set(existingUpdates).where(eq(lenses.id, existingLensId));
  await createRevision({
    entityType: "lens",
    entityId: existingLensId,
    summary: `DPReview watcher: marked as version${opts.existingLabel ? ` "${opts.existingLabel}"` : ""} of "${candidate.name}"`,
    userId: await getBotUserId(),
    autoPatrol: true,
  });

  const changes = mapDpreviewSpecs(candidate);
  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems);
  changes.systemId = findSystemId(mountString(candidate), allSystems);
  changes.images = await uploadCandidateImages(candidate);

  const newName =
    opts.newLabel && !candidate.name.includes(opts.newLabel)
      ? `${candidate.name} ${opts.newLabel}`
      : candidate.name;
  changes.name = newName;
  changes.slug = await uniqueLensSlug(generateSlug(newName));
  changes.versionGroupId = versionGroupId;
  if (opts.newLabel) changes.versionLabel = opts.newLabel;

  const [created] = await db
    .insert(lenses)
    .values(changes as typeof lenses.$inferInsert)
    .returning({ id: lenses.id, slug: lenses.slug });

  await linkLensSystems(created.id, candidate, allSystems);

  await createRevision({
    entityType: "lens",
    entityId: created.id,
    summary: `DPReview watcher: new version${opts.newLabel ? ` "${opts.newLabel}"` : ""} of lens #${existingLensId} (${candidate.dpreviewUrl})`,
    userId: await getBotUserId(),
    autoPatrol: true,
  });

  revalidatePath(`/lenses/${existing.slug}`);
  revalidatePath(`/lenses/${created.slug}`);
  revalidateTag("lenses", "max");

  return { newLensId: created.id, newSlug: created.slug, versionGroupId };
}
