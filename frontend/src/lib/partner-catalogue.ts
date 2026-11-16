import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, kitItems, lenses, lensSystems, systems } from "@/db/schema";
import { buildBrandMatch, buildNameSearch } from "@/lib/search";
import {
  partnerCamera,
  partnerLens,
  refKey,
  type EntityRef,
  type EntityType,
  type KitChanges,
  type PartnerCamera,
  type PartnerItem,
  type PartnerLens,
  type SearchRequest,
} from "@/lib/partner-objects";

/** The catalogue and kit reads and writes behind the partner API. */

const LENS_COLUMNS = {
  id: lenses.id,
  name: lenses.name,
  slug: lenses.slug,
  brand: lenses.brand,
  yearIntroduced: lenses.yearIntroduced,
  focalLengthMin: lenses.focalLengthMin,
  focalLengthMax: lenses.focalLengthMax,
  apertureMin: lenses.apertureMin,
  apertureMax: lenses.apertureMax,
  systemId: lenses.systemId,
  mergedIntoId: lenses.mergedIntoId,
  viewCount: lenses.viewCount,
};

const CAMERA_COLUMNS = {
  id: cameras.id,
  name: cameras.name,
  slug: cameras.slug,
  brand: cameras.brand,
  yearIntroduced: cameras.yearIntroduced,
  systemId: cameras.systemId,
  builtInLensId: cameras.builtInLensId,
  mergedIntoId: cameras.mergedIntoId,
  viewCount: cameras.viewCount,
};

type LensRecord = Awaited<ReturnType<typeof lensesById>>[number];
type CameraRecord = Awaited<ReturnType<typeof camerasById>>[number];

function lensesById(ids: number[]) {
  return db.select(LENS_COLUMNS).from(lenses).where(inArray(lenses.id, ids));
}

function camerasById(ids: number[]) {
  return db.select(CAMERA_COLUMNS).from(cameras).where(inArray(cameras.id, ids));
}

/** Lens objects by id, each with the mounts it exists in, its primary mount first. */
async function shapeLenses(rows: LensRecord[]): Promise<Map<number, PartnerLens>> {
  if (rows.length === 0) return new Map();
  const mountRows = await db
    .select({ lensId: lensSystems.lensId, systemId: lensSystems.systemId, name: systems.name })
    .from(lensSystems)
    .innerJoin(systems, eq(systems.id, lensSystems.systemId))
    .where(
      inArray(
        lensSystems.lensId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(systems.name));

  const mounts = new Map<number, { systemId: number; name: string }[]>();
  for (const m of mountRows) {
    mounts.set(m.lensId, [...(mounts.get(m.lensId) ?? []), m]);
  }
  return new Map(
    rows.map((row) => {
      const own = mounts.get(row.id) ?? [];
      const names = [
        ...own.filter((m) => m.systemId === row.systemId),
        ...own.filter((m) => m.systemId !== row.systemId),
      ].map((m) => m.name);
      return [row.id, partnerLens(row, names)];
    }),
  );
}

/** Camera objects by id, each with its mount and, for a fixed-lens body, its lens. */
async function shapeCameras(rows: CameraRecord[]): Promise<Map<number, PartnerCamera>> {
  if (rows.length === 0) return new Map();
  const systemIds = [...new Set(rows.flatMap((r) => (r.systemId == null ? [] : [r.systemId])))];
  const lensIds = [...new Set(rows.flatMap((r) => (r.builtInLensId == null ? [] : [r.builtInLensId])))];

  const [systemRows, builtIn] = await Promise.all([
    systemIds.length
      ? db.select({ id: systems.id, name: systems.name }).from(systems).where(inArray(systems.id, systemIds))
      : [],
    lensIds.length ? lensesById(lensIds).then(shapeLenses) : new Map<number, PartnerLens>(),
  ]);
  const mountName = new Map(systemRows.map((s) => [s.id, s.name]));

  return new Map(
    rows.map((row) => [
      row.id,
      partnerCamera(
        row,
        row.systemId == null ? null : (mountName.get(row.systemId) ?? null),
        row.builtInLensId == null ? null : (builtIn.get(row.builtInLensId) ?? null),
      ),
    ]),
  );
}

/**
 * The catalogue rows a set of ids stands for today, keyed by the id asked
 * for. A merged row answers with its survivor; merges re-point everything
 * already retired into the loser, so one hop always reaches it.
 */
async function currentRows<T extends { id: number; mergedIntoId: number | null }>(
  ids: number[],
  byId: (ids: number[]) => Promise<T[]>,
): Promise<Map<number, T>> {
  if (ids.length === 0) return new Map();
  const asked = await byId(ids);
  const loaded = new Map(asked.map((r) => [r.id, r]));
  const missing = [
    ...new Set(asked.flatMap((r) => (r.mergedIntoId != null && !loaded.has(r.mergedIntoId) ? [r.mergedIntoId] : []))),
  ];
  for (const survivor of missing.length ? await byId(missing) : []) loaded.set(survivor.id, survivor);

  const out = new Map<number, T>();
  for (const row of asked) {
    const current = row.mergedIntoId == null ? row : loaded.get(row.mergedIntoId);
    if (current) out.set(row.id, current);
  }
  return out;
}

/**
 * Lenses and cameras matching a search, the most viewed first. Every word
 * has to appear in the brand or the name, in any order; a camera's other
 * names count too.
 */
export async function searchCatalogue(request: SearchRequest): Promise<PartnerItem[]> {
  const lensMatch = buildNameSearch(sql`concat_ws(' ', ${lenses.brand}, ${lenses.name})`, request.q);
  const cameraMatch = buildNameSearch(
    sql`concat_ws(' ', ${cameras.brand}, ${cameras.name}, ${cameras.alias})`,
    request.q,
  );
  // A query of punctuation alone has no words to match.
  if (lensMatch.length === 0) return [];

  const wants = (type: EntityType) => request.type === null || request.type === type;
  const [lensRows, cameraRows] = await Promise.all([
    wants("lens")
      ? db
          .select(LENS_COLUMNS)
          .from(lenses)
          .where(
            and(
              ...lensMatch,
              isNull(lenses.mergedIntoId),
              request.brand ? buildBrandMatch(lenses.brand, request.brand) : undefined,
            ),
          )
          .orderBy(sql`${lenses.viewCount} desc nulls last`, asc(lenses.name))
          .limit(request.limit)
      : [],
    wants("camera")
      ? db
          .select(CAMERA_COLUMNS)
          .from(cameras)
          .where(
            and(
              ...cameraMatch,
              isNull(cameras.mergedIntoId),
              request.brand ? buildBrandMatch(cameras.brand, request.brand) : undefined,
            ),
          )
          .orderBy(sql`${cameras.viewCount} desc nulls last`, asc(cameras.name))
          .limit(request.limit)
      : [],
  ]);

  const [lensObjects, cameraObjects] = await Promise.all([
    shapeLenses(lensRows),
    shapeCameras(cameraRows),
  ]);
  const ranked = [
    ...lensRows.map((r) => ({ views: r.viewCount ?? 0, item: lensObjects.get(r.id) as PartnerItem })),
    ...cameraRows.map((r) => ({ views: r.viewCount ?? 0, item: cameraObjects.get(r.id) as PartnerItem })),
  ].sort((a, b) => b.views - a.views || a.item.name.localeCompare(b.item.name));
  return ranked.slice(0, request.limit).map((r) => r.item);
}

/**
 * A member's kit as partner objects, oldest addition first.
 *
 * A kit row can still name a lens or camera that was since merged into
 * another, when its owner had listed both. The survivor is returned once, so
 * an app that replaces its copy on every read never sees a retired row.
 */
async function getPartnerKit(userId: number): Promise<PartnerItem[]> {
  const rows = await db
    .select({ entityType: kitItems.entityType, entityId: kitItems.entityId })
    .from(kitItems)
    .where(eq(kitItems.userId, userId))
    .orderBy(asc(kitItems.createdAt), asc(kitItems.id));
  if (rows.length === 0) return [];

  const idsOf = (type: EntityType) => rows.filter((r) => r.entityType === type).map((r) => r.entityId);
  const [lensRows, cameraRows] = await Promise.all([
    currentRows(idsOf("lens"), lensesById),
    currentRows(idsOf("camera"), camerasById),
  ]);
  const [lensObjects, cameraObjects] = await Promise.all([
    shapeLenses([...new Map([...lensRows.values()].map((r) => [r.id, r])).values()]),
    shapeCameras([...new Map([...cameraRows.values()].map((r) => [r.id, r])).values()]),
  ]);

  const items = new Map<string, PartnerItem>();
  for (const row of rows) {
    const item =
      row.entityType === "lens"
        ? lensObjects.get(lensRows.get(row.entityId)?.id ?? -1)
        : cameraObjects.get(cameraRows.get(row.entityId)?.id ?? -1);
    if (item && !items.has(refKey(item))) items.set(refKey(item), item);
  }
  return [...items.values()];
}

export type KitDocument = { account: { displayName: string }; items: PartnerItem[] };

/** What GET /kit answers with, and what its ETag is computed over. */
export async function getKitDocument(owner: {
  userId: number;
  displayName: string;
}): Promise<KitDocument> {
  return { account: { displayName: owner.displayName }, items: await getPartnerKit(owner.userId) };
}

/**
 * Applies a kit change in one transaction, removals before additions.
 *
 * Adding what is already there and removing what is not both do nothing, so
 * a call can be sent again after a dropped connection. Entries naming nothing
 * in the catalogue are returned in `notFound` and the rest is applied.
 */
export async function applyKitChanges(
  userId: number,
  changes: KitChanges,
): Promise<{ notFound: EntityRef[]; changed: boolean }> {
  const all = [...changes.add, ...changes.remove];
  const idsOf = (type: EntityType) => [...new Set(all.filter((r) => r.type === type).map((r) => r.id))];
  const [lensRows, cameraRows] = await Promise.all([
    currentRows(idsOf("lens"), lensesById),
    currentRows(idsOf("camera"), camerasById),
  ]);
  const currentId = (ref: EntityRef) =>
    (ref.type === "lens" ? lensRows : cameraRows).get(ref.id)?.id ?? null;

  const notFound = [...new Map(all.filter((r) => currentId(r) === null).map((r) => [refKey(r), r])).values()];
  const survivors = (refs: EntityRef[], type: EntityType) => [
    ...new Set(
      refs.flatMap((r) => {
        const id = r.type === type ? currentId(r) : null;
        return id === null ? [] : [id];
      }),
    ),
  ];

  const changed = await db.transaction(async (tx) => {
    let touched = 0;
    for (const [type, table] of [
      ["lens", lenses],
      ["camera", cameras],
    ] as const) {
      const removing = survivors(changes.remove, type);
      if (removing.length > 0) {
        // The owner of both a survivor and a row merged into it holds two kit
        // rows for what now reads as one item, so both go.
        const retired = await tx
          .select({ id: table.id })
          .from(table)
          .where(inArray(table.mergedIntoId, removing));
        const removed = await tx
          .delete(kitItems)
          .where(
            and(
              eq(kitItems.userId, userId),
              eq(kitItems.entityType, type),
              inArray(kitItems.entityId, [...removing, ...retired.map((r) => r.id)]),
            ),
          )
          .returning({ id: kitItems.id });
        touched += removed.length;
      }

      const adding = survivors(changes.add, type);
      if (adding.length > 0) {
        const added = await tx
          .insert(kitItems)
          .values(adding.map((entityId) => ({ userId, entityType: type, entityId })))
          .onConflictDoNothing({
            target: [kitItems.userId, kitItems.entityType, kitItems.entityId],
          })
          .returning({ id: kitItems.id });
        touched += added.length;
      }
    }
    return touched > 0;
  });

  return { notFound, changed };
}
