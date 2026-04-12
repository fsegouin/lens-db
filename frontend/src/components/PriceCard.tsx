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
  extractedAt: Date;
}

interface PriceHistoryEntry {
  saleDate: string | null;
  condition: string | null;
  priceUsd: number | null;
  source: string | null;
}

interface PriceCardProps {
  estimate: PriceEstimate | null;
  history: PriceHistoryEntry[];
}

function formatPrice(low: number | null, high: number | null) {
  if (low == null && high == null) return "—";
  if (low === high || high == null) return `$${low?.toLocaleString()}`;
  if (low == null) return `$${high.toLocaleString()}`;
  return `$${low.toLocaleString()}–${high.toLocaleString()}`;
}

function formatCondition(cond: string | null) {
  if (!cond) return "—";
  const labels: Record<string, string> = {
    A: "Excellent",
    "A+": "Excellent+",
    B: "Good",
    "B+": "Good+",
    "B-A": "Good–Excellent",
    "B-C": "Good–Fair",
    C: "Fair",
    "C+": "Fair+",
    "C-B": "Fair–Good",
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
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 ${
            i < count
              ? "text-amber-500 dark:text-amber-400"
              : "text-zinc-200 dark:text-zinc-700"
          }`}
          fill="currentColor"
        >
          <path d="M8 1l2.5 4.5L16 7l-4 4 1 5-5-2.5L3 16l1-5-4-4 5.5-1.5z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </span>
  );
}

export default function PriceCard({ estimate, history }: PriceCardProps) {
  if (!estimate && history.length === 0) return null;

  const hasEstimate =
    estimate &&
    (estimate.priceAverageLow != null || estimate.priceVeryGoodLow != null);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Price Guide
      </h3>

      {hasEstimate && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-zinc-800">
            <div className="p-4 text-center">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Average
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {formatPrice(estimate!.priceAverageLow, estimate!.priceAverageHigh)}
              </div>
            </div>
            <div className="p-4 text-center">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Very Good
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {formatPrice(estimate!.priceVeryGoodLow, estimate!.priceVeryGoodHigh)}
              </div>
            </div>
            <div className="p-4 text-center bg-zinc-50 dark:bg-zinc-900/50">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Mint
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {formatPrice(estimate!.priceMintLow, estimate!.priceMintHigh)}
              </div>
            </div>
          </div>

          {(estimate!.rarity || estimate!.sourceUrl) && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
              {estimate!.rarity && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                    Rarity
                  </span>
                  <RarityDiamonds label={estimate!.rarity} />
                  {estimate!.rarityVotes != null && (
                    <span className="text-xs text-zinc-400">
                      ({estimate!.rarityVotes} votes)
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-zinc-400">
                Prices from{" "}
                {estimate!.sourceUrl ? (
                  <a
                    href={estimate!.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    CollectiBlend
                  </a>
                ) : (
                  "CollectiBlend"
                )}
                {" · "}
                {new Date(estimate!.extractedAt).toLocaleDateString("en-US", {
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
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400">
            Sale history ({history.length} records)
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Condition</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
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
                    <TableCell className="text-sm text-zinc-500">
                      {entry.source ?? "—"}
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
