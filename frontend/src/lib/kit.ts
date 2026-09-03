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
      acquiredYear: row.acquiredYear,
      acquiredPrice: row.acquiredPrice,
      notes: row.notes,
      estimatedUsd,
    });
  }
  return out;
}

export function kitValue(items: KitItem[]): KitValue {
  let estimatedUsd = 0;
  let pricedItems = 0;
  let paid = 0;
  let paidItems = 0;
  let totalItems = 0;

  for (const item of items) {
    totalItems += item.quantity;
    if (item.estimatedUsd != null) {
      estimatedUsd += item.estimatedUsd * item.quantity;
      pricedItems += item.quantity;
    }
    if (item.acquiredPrice != null) {
      paid += item.acquiredPrice * item.quantity;
      paidItems += item.quantity;
    }
  }

  return { estimatedUsd, pricedItems, totalItems, paid, paidItems };
}

/**
 * A profile, by handle.
 *
 * Everyone who has an account has a profile page. Whether their kit is shown
 * on it is a separate choice, carried here as kitIsPublic for the page to act
 * on, so that having an account and showing what you own stay distinct.
 */
export const getProfile = unstable_cache(
  async (handle: string) => {
    const [profile] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
        kitIsPublic: users.kitIsPublic,
        kitCurrency: users.kitCurrency,
        editCount: users.editCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.handle, handle), eq(users.isBanned, false)))
      .limit(1);
    return profile ?? null;
  },
  ["profile-by-handle"],
  { revalidate: 300, tags: ["kit"] },
);

export type Owner = {
  handle: string;
  displayName: string;
  quantity: number;
  condition: string | null;
  acquiredYear: number | null;
  acquiredPrice: number | null;
  currency: string;
};

/**
 * Who owns one lens or body, among the people who publish their kit.
 *
 * This is the surface the kit data was collected for. A directory of names
 * nobody browses; a lens page is where the question is actually asked, and
 * "four people here own this, one paid 170 in 2024" answers it with something
 * no retailer has: what it went for, from the person who bought it.
 */
export const getOwnersOf = unstable_cache(
  async (entityType: KitEntityType, entityId: number): Promise<Owner[]> => {
    const rows = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        currency: users.kitCurrency,
        quantity: kitItems.quantity,
        condition: kitItems.condition,
        acquiredYear: kitItems.acquiredYear,
        acquiredPrice: kitItems.acquiredPrice,
      })
      .from(kitItems)
      .innerJoin(users, eq(users.id, kitItems.userId))
      .where(
        and(
          eq(kitItems.entityType, entityType),
          eq(kitItems.entityId, entityId),
          eq(users.kitIsPublic, true),
          eq(users.isBanned, false),
        ),
      )
      .orderBy(kitItems.createdAt);

    return rows
      .filter((r): r is typeof r & { handle: string } => r.handle != null)
      .map((r) => ({
        handle: r.handle,
        displayName: r.displayName,
        quantity: r.quantity,
        condition: r.condition,
        acquiredYear: r.acquiredYear,
        acquiredPrice: r.acquiredPrice,
        currency: r.currency,
      }));
  },
  ["owners-of"],
  { revalidate: 604800, tags: ["kit"] },
);

export type PublicKitSummary = {
  handle: string;
  displayName: string;
  itemCount: number;
  lensCount: number;
  cameraCount: number;
};

/**
 * The published kits, most furnished first.
 *
 * Publishing has to lead somewhere or it is just a link its owner can send.
 * Kits with nothing in them are left out: an empty page is not worth a row,
 * and it is the one case where a listing would embarrass its owner.
 */
export const getPublicKits = unstable_cache(
  async (limit = 100): Promise<PublicKitSummary[]> => {
    const rows = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        entityType: kitItems.entityType,
        quantity: kitItems.quantity,
      })
      .from(users)
      .innerJoin(kitItems, eq(kitItems.userId, users.id))
      .where(and(eq(users.kitIsPublic, true), eq(users.isBanned, false)));

    const byHandle = new Map<string, PublicKitSummary>();
    for (const row of rows) {
      if (!row.handle) continue;
      const entry = byHandle.get(row.handle) ?? {
        handle: row.handle,
        displayName: row.displayName,
        itemCount: 0,
        lensCount: 0,
        cameraCount: 0,
      };
      entry.itemCount += row.quantity;
      if (row.entityType === "lens") entry.lensCount += row.quantity;
      else entry.cameraCount += row.quantity;
      byHandle.set(row.handle, entry);
    }

    return [...byHandle.values()]
      .sort((a, b) => b.itemCount - a.itemCount || a.displayName.localeCompare(b.displayName))
      .slice(0, limit);
  },
  ["public-kits"],
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
