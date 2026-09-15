import PriceChart, { type PriceHistoryEntry } from "@/components/PriceChart";
import { getPriceDisplay } from "@/lib/price-display";

interface PriceEstimate {
  priceAverageLow: number | null;
  priceAverageHigh: number | null;
  priceVeryGoodLow: number | null;
  priceVeryGoodHigh: number | null;
  priceMintLow: number | null;
  priceMintHigh: number | null;
  /**
   * Where the figure came from: "sold" (real completed sales), "keh" (a
   * dealer's graded stock, corrected) or "asking" (live marketplace listings,
   * corrected). The last two are inferences and say so on the card.
   *
   * The card never names the dealer. Which shop we buy the comparison from is
   * ours, not the reader's, and the sentence says the same true thing without
   * it: a price someone is asking today, corrected towards what things go for
   * privately.
   */
  priceSource: string;
  sourceUrl: string | null;
  extractedAt: Date;
}

interface PriceCardProps {
  estimate: PriceEstimate | null;
  history: PriceHistoryEntry[];
}

function formatPrice(low: number | null, high: number | null) {
  // Treat 0 as missing
  if (!low && !high) return "—";
  if (low === high || high == null) return `$${low?.toLocaleString()}`;
  if (low == null) return `$${high.toLocaleString()}`;
  return `$${low.toLocaleString()}–${high.toLocaleString()}`;
}

export default function PriceCard({
  estimate,
  history,
}: PriceCardProps) {
  const shownEstimate =
    estimate != null &&
    (estimate.priceAverageLow != null || estimate.priceVeryGoodLow != null)
      ? estimate
      : null;

  // An estimate row can exist with no prices at all (1,707 lens rows do).
  // Without prices, and with too few points for the chart, there is nothing
  // to show, and a bare "Used prices" heading over an empty box is worse
  // than no section.
  if (!shownEstimate && history.length < 2) return null;

  const display = getPriceDisplay(shownEstimate);
  const showTiers = display?.showTiers ?? false;
  const spanLow = display?.low ?? null;
  const spanHigh = display?.high ?? null;

  // A figure read off prices being asked today, whether by private sellers or
  // by a dealer, is an inference and never claims to be what something sold
  // for. Condition tiers only ever come from graded sales, so both of these
  // land in the untiered branch below.
  const fromAsking = shownEstimate?.priceSource === "asking";
  const fromKeh = shownEstimate?.priceSource === "keh";

  const basis =
    fromAsking || fromKeh
      ? "Estimated from listings observed on online marketplaces, adjusted for the gap between what sellers ask and what buyers pay."
      : "Too few graded sales to separate conditions.";

  return (
    <div className="@container space-y-4">
      <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Used prices
      </h2>

      {shownEstimate && !showTiers && (
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {fromAsking || fromKeh ? "Estimated used price" : "Typical used price"}
          </div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums">
            {formatPrice(spanLow, spanHigh)}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{basis}</p>
        </div>
      )}

      {shownEstimate && showTiers && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-border @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
            <div className="flex items-baseline justify-between gap-3 p-3 @sm:block @sm:text-center">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fair
              </div>
              <div className="font-mono text-base font-semibold tabular-nums @sm:mt-1">
                {formatPrice(shownEstimate.priceAverageLow, shownEstimate.priceAverageHigh)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 p-3 @sm:block @sm:text-center">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Good
              </div>
              <div className="font-mono text-base font-semibold tabular-nums @sm:mt-1">
                {formatPrice(shownEstimate.priceVeryGoodLow, shownEstimate.priceVeryGoodHigh)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 bg-muted/40 p-3 @sm:block @sm:text-center">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Excellent
              </div>
              <div className="font-mono text-base font-semibold tabular-nums @sm:mt-1">
                {formatPrice(shownEstimate.priceMintLow, shownEstimate.priceMintHigh)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-border px-3 py-2.5">
            <span className="text-xs text-muted-foreground">
              {/*
                The card never names where a figure came from, whatever the
                source. Keep it that way: two of the sources carry the name of
                a shop we would rather not advertise.
              */}
              {shownEstimate.priceSource === "sold"
                ? "Based on recent sales on online marketplaces"
                : "Based on current used listings"}
              {" · "}
              {new Date(shownEstimate.extractedAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      )}

      {history.length >= 2 && <PriceChart history={history} />}

    </div>
  );
}
