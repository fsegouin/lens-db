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

/**
 * The currencies an owner can record what they paid in.
 *
 * Nothing is converted between them. The site's own estimates come from sales
 * priced in USD, and turning those into another currency would need an
 * exchange rate, and a date for it, that this database does not have. So the
 * paid column is shown in the owner's currency, the estimate stays labelled
 * USD, and the two are never added together.
 */
export const KIT_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "SEK",
  "PLN",
  "BRL",
] as const;

export type KitCurrency = (typeof KIT_CURRENCIES)[number];

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

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
  acquiredYear: number | null;
  acquiredPrice: number | null;
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
  paid: number;
  paidItems: number;
};
