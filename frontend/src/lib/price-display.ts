export type PriceEstimateLike = {
  priceAverageLow: number | null;
  priceAverageHigh: number | null;
  priceVeryGoodLow: number | null;
  priceVeryGoodHigh: number | null;
  priceMintLow: number | null;
  priceMintHigh: number | null;
  medianPrice?: number | null;
  currency?: string | null;
};

export type PriceTier = { label: string; low: number | null; high: number | null };

export type PriceDisplay = {
  /** The headline range, and the only figure any summary should quote. */
  low: number | null;
  high: number | null;
  currency: string;
  tiers: PriceTier[];
  /** Tiers are only trustworthy when they ascend; see below. */
  showTiers: boolean;
};

/**
 * One source of truth for what a record's used price says.
 *
 * The three condition tiers are computed per grade from whatever sales exist,
 * and on thin data they contradict each other (an Irix 11mm read Fair
 * $199-225, Good $225-280, Excellent $157). When they do not ascend they are
 * suppressed in favour of the span they cover.
 *
 * The headline range is that same span either way, so the summary under the
 * title and the card in the rail can never disagree: before this existed, a
 * Nikon F4 showed "$190-210" in one place and "$170-379" in the other.
 */
export function getPriceDisplay(
  estimate: PriceEstimateLike | null | undefined,
): PriceDisplay | null {
  if (!estimate) return null;

  const tiers: PriceTier[] = [
    { label: "Fair", low: estimate.priceAverageLow, high: estimate.priceAverageHigh },
    { label: "Good", low: estimate.priceVeryGoodLow, high: estimate.priceVeryGoodHigh },
    { label: "Excellent", low: estimate.priceMintLow, high: estimate.priceMintHigh },
  ];

  const bounds = tiers
    .flatMap((t) => [t.low, t.high])
    .filter((v): v is number => v != null && v > 0);

  if (bounds.length === 0) {
    const median = estimate.medianPrice ?? null;
    if (median == null) return null;
    return {
      low: median,
      high: median,
      currency: estimate.currency ?? "USD",
      tiers: [],
      showTiers: false,
    };
  }

  return {
    low: Math.min(...bounds),
    high: Math.max(...bounds),
    currency: estimate.currency ?? "USD",
    tiers,
    showTiers: tiersAscend(tiers),
  };
}

function tiersAscend(tiers: PriceTier[]): boolean {
  const lows = tiers.map((t) => t.low ?? t.high);
  const highs = tiers.map((t) => t.high ?? t.low);
  if (lows.some((v) => v == null) || highs.some((v) => v == null)) return false;
  for (let i = 1; i < tiers.length; i++) {
    if (lows[i]! < lows[i - 1]! || highs[i]! < highs[i - 1]!) return false;
  }
  return true;
}
