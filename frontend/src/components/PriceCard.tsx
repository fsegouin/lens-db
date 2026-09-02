import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PriceChart from "@/components/PriceChart";

interface PriceEstimate {
  priceAverageLow: number | null;
  priceAverageHigh: number | null;
  priceVeryGoodLow: number | null;
  priceVeryGoodHigh: number | null;
  priceMintLow: number | null;
  priceMintHigh: number | null;
  rarity: string | null;
  rarityVotes: number | null;
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

const RARITY_SCALE: Record<string, number> = {
  "Very common": 1,
  "Not rare": 1,
  "Common": 2,
  "Somewhat rare": 3,
  "Very scarce": 4,
  "Extremely rare": 5,
};

function RarityDiamonds({ label }: { label: string }) {
  const count = RARITY_SCALE[label] ?? 0;
  if (count === 0) return <span>{label}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 ${
            i < count
              ? "text-amber-500 dark:text-amber-400"
              : "text-zinc-200 dark:text-foreground"
          }`}
          fill="currentColor"
        >
          <path d="M8 1l2.5 4.5L16 7l-4 4 1 5-5-2.5L3 16l1-5-4-4 5.5-1.5z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

/**
 * The three condition tiers are computed per condition grade from whatever
 * sales exist, and with a handful of sales they routinely come out unordered:
 * an Irix 11mm showed Fair $199-225, Good $225-280 and Excellent $157. Three
 * tiers that contradict each other are worse than one honest range, so they
 * are only shown when they actually ascend.
 */
type Tier = { label: string; low: number | null; high: number | null };

function tiersAreOrdered(tiers: Tier[]): boolean {
  const bounds = tiers.map((t) => t.low ?? t.high).filter((v): v is number => v != null);
  if (bounds.length < tiers.length) return false;
  const highs = tiers.map((t) => t.high ?? t.low).filter((v): v is number => v != null);
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] < bounds[i - 1]) return false;
    if (highs[i] < highs[i - 1]) return false;
  }
  return true;
}

/** Rarity is a claim about scarcity, so it needs enough sales to stand up. */
const MIN_SALES_FOR_RARITY = 20;

export default function PriceCard({ estimate, history }: PriceCardProps) {
  const shownEstimate =
    estimate != null &&
    (estimate.priceAverageLow != null || estimate.priceVeryGoodLow != null)
      ? estimate
      : null;

  // An estimate row can carry a rarity label and no prices at all (1,707 lens
  // rows do). Without prices and without sales there is nothing to show, and a
  // bare "Used prices" heading over an empty box is worse than no section.
  if (!shownEstimate && history.length === 0) return null;

  const tiers: Tier[] = shownEstimate
    ? [
        { label: "Fair", low: shownEstimate.priceAverageLow, high: shownEstimate.priceAverageHigh },
        { label: "Good", low: shownEstimate.priceVeryGoodLow, high: shownEstimate.priceVeryGoodHigh },
        { label: "Excellent", low: shownEstimate.priceMintLow, high: shownEstimate.priceMintHigh },
      ]
    : [];
  const showTiers = tiers.length > 0 && tiersAreOrdered(tiers);

  // When the tiers disagree, fall back to the span they cover.
  const allBounds = tiers
    .flatMap((t) => [t.low, t.high])
    .filter((v): v is number => v != null && v > 0);
  const spanLow = allBounds.length ? Math.min(...allBounds) : null;
  const spanHigh = allBounds.length ? Math.max(...allBounds) : null;

  const saleCount = shownEstimate?.rarityVotes ?? history.length;
  const showRarity =
    shownEstimate?.rarity != null && saleCount >= MIN_SALES_FOR_RARITY;

  return (
    <div className="@container space-y-4">
      <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Used prices
      </h2>

      {shownEstimate && !showTiers && (
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Typical used price
          </div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums">
            {formatPrice(spanLow, spanHigh)}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Too few graded sales to separate conditions.
          </p>
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

          {(showRarity || shownEstimate.sourceUrl) && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-3 py-2.5">
              {showRarity && shownEstimate.rarity && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Rarity
                  </span>
                  <RarityDiamonds label={shownEstimate.rarity} />
                  {shownEstimate.rarityVotes != null && shownEstimate.rarityVotes > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({shownEstimate.rarityVotes} sold in last 90 days)
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                Based on recent {shownEstimate.sourceName || "eBay"} sales
                {" · "}
                {new Date(shownEstimate.extractedAt).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {history.length >= 2 && <PriceChart history={history} />}

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
