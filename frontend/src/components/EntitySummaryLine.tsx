import { Star } from "lucide-react";

type Props = {
  /** From getPriceDisplay, the single source of truth for price copy. */
  priceRange: { low: number | null; high: number | null; currency: string } | null;
  averageRating: number | null;
  ratingCount: number | null;
  saleCount: number;
};

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

/**
 * The two numbers people arrive for, on one line directly under the title, so
 * neither the price nor the rating needs a scroll to read.
 */
export default function EntitySummaryLine({
  priceRange,
  averageRating,
  ratingCount,
  saleCount,
}: Props) {
  const currency = priceRange?.currency ?? "USD";

  // A range whose ends round to the same figure is a single price, not a
  // range: "$420–$420" is how it read before.
  let price: string | null = null;
  if (priceRange?.low != null && priceRange.high != null) {
    const low = formatMoney(priceRange.low, currency);
    const high = formatMoney(priceRange.high, currency);
    price = low === high ? low : `${low}–${high}`;
  }

  if (!price && !averageRating) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border py-3 text-sm">
      {price && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground">Used</span>
          <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {price}
          </span>
        </span>
      )}
      {averageRating != null && (ratingCount ?? 0) > 0 && (
        <span className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
          <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {averageRating.toFixed(1)}
          </span>
          <span className="text-muted-foreground">
            /10 from {ratingCount!.toLocaleString()}{" "}
            {ratingCount === 1 ? "rating" : "ratings"}
          </span>
        </span>
      )}
      {saleCount > 0 && (
        <span className="text-muted-foreground tabular-nums">
          {saleCount.toLocaleString()} recorded {saleCount === 1 ? "sale" : "sales"}
        </span>
      )}
    </div>
  );
}
