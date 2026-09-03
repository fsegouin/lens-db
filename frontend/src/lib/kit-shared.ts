/**
 * The parts of the kit model the browser needs.
 *
 * Kept apart from lib/kit.ts because that module reaches the database, and a
 * client component importing one value from it would pull the whole database
 * layer into the browser bundle.
 */

export type KitEntityType = "lens" | "camera";

export const KIT_CONDITIONS = [
  "Excellent",
  "Good",
  "Fair",
  "For parts",
] as const;

export type KitItem = {
  id: number;
  entityType: KitEntityType;
  entityId: number;
  name: string;
  slug: string;
  brand: string | null;
  yearIntroduced: number | null;
  quantity: number;
  condition: string | null;
  serialNumber: string | null;
  acquiredOn: string | null;
  acquiredPriceUsd: number | null;
  notes: string | null;
  /** Midpoint of the used range, per item, or null when nothing is recorded. */
  estimatedUsd: number | null;
};

export type KitValue = {
  /** Summed midpoints, and how much of the kit that figure actually covers. */
  estimatedUsd: number;
  pricedItems: number;
  totalItems: number;
  /** What the owner says they paid, for the items where they said. */
  paidUsd: number;
  paidItems: number;
};
