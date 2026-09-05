import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PriceChart, { type AskingSnapshot } from "@/components/PriceChart";
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
   * dealer's graded stock, corrected) or "asking" (live eBay listings,
   * corrected). The last two are inferences and say so on the card.
   *
   * The card never names the dealer. Which shop we buy the comparison from is
   * ours, not the reader's, and the sentence says the same true thing without
   * it: a price someone is asking today, corrected towards what things go for
   * privately.
   */
  priceSource: string;
  sourceUrl: string | null;
  sourceName: string | null;
  extractedAt: Date;
}

interface PriceHistoryEntry {
  saleDate: string | null;
  condition: string | null;
  priceUsd: number | null;
  source: string | null;
  sourceUrl: string | null;
}

interface PriceCardProps {
  estimate: PriceEstimate | null;
  history: PriceHistoryEntry[];
  /** Daily asking aggregates, charted against the recorded sales. */
  asking?: AskingSnapshot[];
}

function formatPrice(low: number | null, high: number | null) {
  // Treat 0 as missing
  if (!low && !high) return "—";
  if (low === high || high == null) return `$${low?.toLocaleString()}`;
  if (low == null) return `$${high.toLocaleString()}`;
  return `$${low.toLocaleString()}–${high.toLocaleString()}`;
}

function formatCondition(cond: string | null) {
  if (!cond) return "—";
  const labels: Record<string, string> = {
    A: "Excellent",
    "A+": "Excellent",
    B: "Good",
    "B+": "Good",
    "B-A": "Good",
    "B-C": "Fair",
    C: "Fair",
    "C+": "Fair",
    "C-B": "Fair",
    D: "Poor",
  };
  return labels[cond] ?? cond;
}

export default function PriceCard({
  estimate,
  history,
  asking = [],
}: PriceCardProps) {
  const shownEstimate =
    estimate != null &&
    (estimate.priceAverageLow != null || estimate.priceVeryGoodLow != null)
      ? estimate
      : null;

  // An estimate row can exist with no prices at all (1,707 lens rows do).
  // Without prices and without sales there is nothing to show, and a bare
  // "Used prices" heading over an empty box is worse than no section.
  if (!shownEstimate && history.length === 0 && asking.length === 0) return null;

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

  // How many live listings the figure rests on. Naming it matters most where
  // the number is smallest: an estimate from three listings and one from
  // eighty read identically otherwise.
  const askingSample = fromAsking
    ? (asking[asking.length - 1]?.sampleCount ?? null)
    : null;

  const basis = fromAsking
    ? `Estimated from ${
        askingSample != null
          ? `${askingSample} current eBay ${askingSample === 1 ? "listing" : "listings"}`
          : "current eBay listings"
      }, adjusted for the gap between what sellers ask and what buyers pay.`
    : fromKeh
      ? "Estimated from current used listings, adjusted for the gap between what sellers ask and what buyers pay."
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
                Only a sold estimate may name its source. The other two carry
                the name of a shop we would rather not advertise, and this
                branch is one refactor away from printing it: it is unreachable
                for them today only because they set a single condition tier
                and the tiers have to ascend to get here.
              */}
              {shownEstimate.priceSource === "sold"
                ? `Based on recent ${shownEstimate.sourceName || "eBay"} sales`
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

      {(history.length >= 2 || asking.length >= 2) && (
        <PriceChart history={history} asking={asking} />
      )}

      {history.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Sale history ({history.length} records)
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Table aria-label="Sale history">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="text-xs">Date</TableHead>
                  <TableHead scope="col" className="text-xs">Condition</TableHead>
                  <TableHead scope="col" className="text-xs text-right">Price</TableHead>
                  <TableHead scope="col" className="text-xs">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{entry.saleDate ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {formatCondition(entry.condition)}
                    </TableCell>
                    <TableCell className="text-sm text-right font-medium">
                      {entry.priceUsd != null
                        ? `$${entry.priceUsd.toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.sourceUrl ? (
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                          {entry.source ?? "Link"}
                        </a>
                      ) : (
                        entry.source ?? "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </div>
  );
}
