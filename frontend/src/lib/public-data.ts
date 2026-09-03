import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, lensSystems, systems } from "@/db/schema";
import { publicCamera, publicLens } from "@/lib/public-api";

/** The columns the public lens shape reads, and nothing else. */
const LENS_FIELDS = {
  id: lenses.id,
  slug: lenses.slug,
  name: lenses.name,
  brand: lenses.brand,
  lensType: lenses.lensType,
  focalLengthMin: lenses.focalLengthMin,
  focalLengthMax: lenses.focalLengthMax,
  apertureMin: lenses.apertureMin,
  apertureMax: lenses.apertureMax,
  weightG: lenses.weightG,
  filterSizeMm: lenses.filterSizeMm,
  minFocusDistanceM: lenses.minFocusDistanceM,
  maxMagnification: lenses.maxMagnification,
  lensElements: lenses.lensElements,
  lensGroups: lenses.lensGroups,
  diaphragmBlades: lenses.diaphragmBlades,
  yearIntroduced: lenses.yearIntroduced,
  yearDiscontinued: lenses.yearDiscontinued,
  isZoom: lenses.isZoom,
  isMacro: lenses.isMacro,
  isPrime: lenses.isPrime,
  hasStabilization: lenses.hasStabilization,
  hasAutofocus: lenses.hasAutofocus,
  coverage: lenses.coverage,
  era: lenses.era,
  productionStatus: lenses.productionStatus,
};

const CAMERA_FIELDS = {
  id: cameras.id,
  slug: cameras.slug,
  name: cameras.name,
  sensorType: cameras.sensorType,
  sensorSize: cameras.sensorSize,
  megapixels: cameras.megapixels,
  resolution: cameras.resolution,
  bodyType: cameras.bodyType,
  shutterType: cameras.shutterType,
  weightG: cameras.weightG,
  yearIntroduced: cameras.yearIntroduced,
  systemId: cameras.systemId,
};

/** Mount ids per lens, since a lens is often sold in several. */
async function mountsByLens(lensIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (lensIds.length === 0) return out;
  const rows = await db
    .select({ lensId: lensSystems.lensId, slug: systems.slug })
    .from(lensSystems)
    .innerJoin(systems, eq(systems.id, lensSystems.systemId))
    .where(inArray(lensSystems.lensId, lensIds));
  for (const r of rows) {
    const list = out.get(r.lensId) ?? [];
    list.push(r.slug);
    out.set(r.lensId, list);
  }
  return out;
}

export type PublicPage = { limit: number; after: number };

/**
 * Keyset pagination by id.
 *
 * Offsets drift when rows are merged away underneath a caller walking the
 * whole set, and walking the whole set is the point of an open API.
 */
export async function getPublicLenses({ limit, after }: PublicPage) {
  const rows = await db
    .select(LENS_FIELDS)
    .from(lenses)
    .where(and(isNull(lenses.mergedIntoId), gt(lenses.id, after)))
    .orderBy(asc(lenses.id))
    .limit(limit);

  const mounts = await mountsByLens(rows.map((r) => r.id));
  return {
    items: rows.map((r) => publicLens(r, mounts.get(r.id) ?? [])),
    nextAfter: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}

export async function getPublicLensBySlug(slug: string) {
  const [row] = await db
    .select(LENS_FIELDS)
    .from(lenses)
    .where(and(eq(lenses.slug, slug), isNull(lenses.mergedIntoId)))
    .limit(1);
  if (!row) return null;
  const mounts = await mountsByLens([row.id]);
  return publicLens(row, mounts.get(row.id) ?? []);
}

async function mountSlugById(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const wanted = ids.filter((id): id is number => id != null);
  if (wanted.length === 0) return out;
  const rows = await db
    .select({ id: systems.id, slug: systems.slug })
    .from(systems)
    .where(inArray(systems.id, wanted));
  for (const r of rows) out.set(r.id, r.slug);
  return out;
}

export async function getPublicCameras({ limit, after }: PublicPage) {
  const rows = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .where(and(isNull(cameras.mergedIntoId), gt(cameras.id, after)))
    .orderBy(asc(cameras.id))
    .limit(limit);

  const mounts = await mountSlugById(
    rows.map((r) => r.systemId).filter((v): v is number => v != null),
  );
  return {
    items: rows.map((r) =>
      publicCamera(r, r.systemId != null ? (mounts.get(r.systemId) ?? null) : null),
    ),
    nextAfter: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}

export async function getPublicCameraBySlug(slug: string) {
  const [row] = await db
    .select(CAMERA_FIELDS)
    .from(cameras)
    .where(and(eq(cameras.slug, slug), isNull(cameras.mergedIntoId)))
    .limit(1);
  if (!row) return null;
  const mounts = await mountSlugById(row.systemId != null ? [row.systemId] : []);
  return publicCamera(row, row.systemId != null ? (mounts.get(row.systemId) ?? null) : null);
}
