import type { ReactNode } from "react";
import { Star } from "lucide-react";

type Props = {
  /** From getPriceDisplay, the single source of truth for price copy. */
  priceRange: { low: number | null; high: number | null; currency: string } | null;
  averageRating: number | null;
  ratingCount: number | null;
  /** Sits at the end of the line: the "I own this" control. */
  trailing?: ReactNode;
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
  trailing,
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

  // The line still earns its place when it carries only the kit control.
  if (!price && !averageRating && !trailing) return null;

  return (
    /*
     * The facts and the control are two flex children rather than one flat
     * row. With justify-between they sit at either end when they fit, and a
     * control that wraps to its own line is the only item on it, so it lands
     * at the start instead of being pushed right by an auto margin.
     */
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-y border-border py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
      </div>
      {trailing}
    </div>
  );
}
