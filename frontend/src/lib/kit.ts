import { unstable_cache } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cameras, kitItems, lenses, priceEstimates, users } from "@/db/schema";
import { getPriceDisplay } from "@/lib/price-display";
import type { KitEntityType, KitItem, KitValue } from "@/lib/kit-shared";

export {
  KIT_CONDITIONS,
  KIT_CURRENCIES,
  formatMoney,
  type KitCurrency,
  type KitEntityType,
  type KitItem,
  type KitValue,
} from "@/lib/kit-shared";

/** A display name for a handle that is not the person's email address. */
export function handleFromDisplayName(displayName: string): string {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "member";
}

/** Appends a number until the handle is free. */
export async function uniqueHandle(displayName: string): Promise<string> {
  const base = handleFromDisplayName(displayName);
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * One kit, joined to whichever table each row points at.
 *
 * entityId is polymorphic, so the lens and camera sides are read separately
 * and merged rather than forced into one join.
 */
export async function getKitItems(userId: number): Promise<KitItem[]> {
  const rows = await db
    .select()
    .from(kitItems)
    .where(eq(kitItems.userId, userId))
    .orderBy(kitItems.createdAt);
  if (rows.length === 0) return [];

  const lensIds = rows.filter((r) => r.entityType === "lens").map((r) => r.entityId);
  const cameraIds = rows.filter((r) => r.entityType === "camera").map((r) => r.entityId);

  const [lensRows, cameraRows, estimateRows] = await Promise.all([
    lensIds.length
      ? db
          .select({
            id: lenses.id,
            name: lenses.name,
            slug: lenses.slug,
            brand: lenses.brand,
            yearIntroduced: lenses.yearIntroduced,
          })
          .from(lenses)
          .where(inArray(lenses.id, lensIds))
      : Promise.resolve([]),
    cameraIds.length
      ? db
          .select({
            id: cameras.id,
            name: cameras.name,
            slug: cameras.slug,
            yearIntroduced: cameras.yearIntroduced,
          })
          .from(cameras)
          .where(inArray(cameras.id, cameraIds))
      : Promise.resolve([]),
    // Two straight lookups rather than a tuple IN, so the ids stay bound
    // parameters instead of being pasted into the statement.
    Promise.all([
      lensIds.length
        ? db
            .select()
            .from(priceEstimates)
            .where(
              and(
                eq(priceEstimates.entityType, "lens"),
                inArray(priceEstimates.entityId, lensIds),
              ),
            )
        : Promise.resolve([]),
      cameraIds.length
        ? db
            .select()
            .from(priceEstimates)
            .where(
              and(
                eq(priceEstimates.entityType, "camera"),
                inArray(priceEstimates.entityId, cameraIds),
              ),
            )
        : Promise.resolve([]),
    ]).then(([a, b]) => [...a, ...b]),
  ]);

  const lensById = new Map(lensRows.map((l) => [l.id, l]));
  const cameraById = new Map(cameraRows.map((c) => [c.id, c]));
  const estimateByKey = new Map(
    estimateRows.map((e) => [`${e.entityType}:${e.entityId}`, e]),
  );

  const out: KitItem[] = [];
  for (const row of rows) {
    const isLens = row.entityType === "lens";
    const lens = isLens ? lensById.get(row.entityId) : undefined;
    const camera = isLens ? undefined : cameraById.get(row.entityId);
    const entity = lens ?? camera;
    // A merged or deleted entity leaves a row pointing at nothing; skip it
    // rather than render a blank line.
    if (!entity) continue;

    const display = getPriceDisplay(estimateByKey.get(`${row.entityType}:${row.entityId}`));
    const estimatedUsd =
      display && display.low != null && display.high != null
        ? Math.round((display.low + display.high) / 2)
        : null;

    out.push({
      id: row.id,
      entityType: row.entityType as KitEntityType,
      entityId: row.entityId,
      name: entity.name,
      slug: entity.slug,
      brand: lens?.brand ?? null,
      yearIntroduced: entity.yearIntroduced,
      quantity: row.quantity,
      condition: row.condition,
      serialNumber: row.serialNumber,
      acquiredOn: row.acquiredOn,
      acquiredPriceUsd: row.acquiredPriceUsd,
      notes: row.notes,
      estimatedUsd,
    });
  }
  return out;
}

export function kitValue(items: KitItem[]): KitValue {
  let estimatedUsd = 0;
  let pricedItems = 0;
  let paidUsd = 0;
  let paidItems = 0;
  let totalItems = 0;

  for (const item of items) {
    totalItems += item.quantity;
    if (item.estimatedUsd != null) {
      estimatedUsd += item.estimatedUsd * item.quantity;
      pricedItems += item.quantity;
    }
    if (item.acquiredPriceUsd != null) {
      paidUsd += item.acquiredPriceUsd * item.quantity;
      paidItems += item.quantity;
    }
  }

  return { estimatedUsd, pricedItems, totalItems, paidUsd, paidItems };
}

/** A published kit, by handle. Returns null when there is none to show. */
export const getPublicKitOwner = unstable_cache(
  async (handle: string) => {
    const [owner] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
        kitIsPublic: users.kitIsPublic,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.handle, handle), eq(users.isBanned, false)))
      .limit(1);
    if (!owner || !owner.kitIsPublic) return null;
    return owner;
  },
  ["public-kit-owner"],
  { revalidate: 300, tags: ["kit"] },
);

/** Whether one entity is already in a person's kit, for the add button. */
export async function isInKit(
  userId: number,
  entityType: KitEntityType,
  entityId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: kitItems.id })
    .from(kitItems)
    .where(
      and(
        eq(kitItems.userId, userId),
        eq(kitItems.entityType, entityType),
        eq(kitItems.entityId, entityId),
      ),
    )
    .limit(1);
  return !!row;
}
