"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface PriceHistoryEntry {
  saleDate: string | null;
  condition: string | null;
  priceUsd: number | null;
  source: string | null;
}

export interface AskingSnapshot {
  observedOn: string | null;
  medianUsd: number | null;
  p25Usd: number | null;
  p75Usd: number | null;
  sampleCount: number;
}

interface PriceChartProps {
  history: PriceHistoryEntry[];
  /** Daily asking aggregates. Absent on entities never polled. */
  asking?: AskingSnapshot[];
}

const SOLD_COLOR = "#3b82f6";
const ASKING_COLOR = "#f59e0b";

const CONDITION_LABELS: Record<string, string> = {
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

type ChartRow = {
  timestamp: number;
  date: string;
  price?: number;
  condition?: string | null;
  trend?: number;
  askingMedian?: number;
  askingBand?: [number, number];
  askingSamples?: number;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function toTimestamp(dateStr: string) {
  return new Date(dateStr + "T00:00:00").getTime();
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  // A row is either a recorded sale or a day's asking reading, never both:
  // sales carry a jittered timestamp so each dot stays individually hoverable.
  const isSale = row.price != null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-800">
      {isSale ? (
        <>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            ${row.price!.toLocaleString()}
          </p>
          <p className="text-muted-foreground">Sold {formatDate(row.date)}</p>
          {row.condition && (
            <p className="text-xs text-muted-foreground">
              {CONDITION_LABELS[row.condition] ?? row.condition}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            ${row.askingMedian?.toLocaleString()}
          </p>
          <p className="text-muted-foreground">Asked {formatDate(row.date)}</p>
          {row.askingBand && (
            <p className="text-xs text-muted-foreground">
              Most listed ${row.askingBand[0].toLocaleString()} to $
              {row.askingBand[1].toLocaleString()}
            </p>
          )}
          {row.askingSamples != null && (
            <p className="text-xs text-muted-foreground">
              {row.askingSamples} {row.askingSamples === 1 ? "listing" : "listings"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export default function PriceChart({ history, asking = [] }: PriceChartProps) {
  const rawSales = history
    .filter((e) => e.saleDate && e.priceUsd != null)
    .map((e) => ({
      date: e.saleDate!,
      price: e.priceUsd!,
      condition: e.condition,
      timestamp: toTimestamp(e.saleDate!),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Offset same-date sales slightly so each dot is individually hoverable.
  const seen = new Map<number, number>();
  const hourMs = 3600000;
  const sales = rawSales.map((p) => {
    const count = seen.get(p.timestamp) ?? 0;
    seen.set(p.timestamp, count + 1);
    return { ...p, timestamp: p.timestamp + count * hourMs };
  });

  const askingPoints = asking
    .filter((a) => a.observedOn && a.medianUsd != null)
    .map((a) => ({
      date: a.observedOn!,
      timestamp: toTimestamp(a.observedOn!),
      median: a.medianUsd!,
      low: a.p25Usd,
      high: a.p75Usd,
      samples: a.sampleCount,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const hasSales = sales.length >= 2;
  const hasAsking = askingPoints.length >= 2;
  if (!hasSales && !hasAsking) return null;

  // Rolling average over the sales, so the trend reads through the scatter.
  const rows: ChartRow[] = [];
  if (sales.length > 0) {
    const span = sales[sales.length - 1].timestamp - sales[0].timestamp;
    const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
    const windowMs = Math.max(sixMonthsMs, span * 0.15);
    for (const p of sales) {
      const nearby = sales.filter(
        (o) => Math.abs(o.timestamp - p.timestamp) <= windowMs / 2,
      );
      rows.push({
        timestamp: p.timestamp,
        date: p.date,
        price: p.price,
        condition: p.condition,
        trend: hasSales
          ? Math.round(nearby.reduce((s, o) => s + o.price, 0) / nearby.length)
          : undefined,
      });
    }
  }

  for (const a of askingPoints) {
    rows.push({
      timestamp: a.timestamp,
      date: a.date,
      askingMedian: a.median,
      askingBand:
        a.low != null && a.high != null ? [a.low, a.high] : undefined,
      askingSamples: a.samples,
    });
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);

  const values = [
    ...sales.map((p) => p.price),
    ...askingPoints.flatMap((a) =>
      [a.median, a.low, a.high].filter((v): v is number => v != null),
    ),
  ];
  const minPrice = Math.min(...values);
  const maxPrice = Math.max(...values);
  const padding = Math.max(10, Math.round((maxPrice - minPrice) * 0.1));
  const firstTs = rows[0].timestamp;
  const lastTs = rows[rows.length - 1].timestamp;

  // Evenly spaced ticks across the real time span. Left to itself recharts
  // labels whichever data points it likes, which lands ticks 15 months apart
  // then 4, and reads as though the axis were not linear.
  const TICK_COUNT = 4;
  const ticks =
    lastTs > firstTs
      ? Array.from({ length: TICK_COUNT }, (_, i) =>
          Math.round(firstTs + ((lastTs - firstTs) * i) / (TICK_COUNT - 1)),
        )
      : [firstTs];

  const latestAsking = askingPoints[askingPoints.length - 1]?.median;
  const label = [
    hasSales ? `Chart of ${sales.length} recorded sale prices` : "Chart",
    hasAsking
      ? `against daily asking prices, most recently a $${latestAsking?.toLocaleString()} asking median`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-2">
      {(hasSales || hasAsking) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {hasSales && <LegendKey color={SOLD_COLOR} label="Sold" />}
          {hasAsking && (
            <LegendKey
              color={ASKING_COLOR}
              // Naming the start date stops the line's mid-chart appearance
              // reading as a sudden price move rather than the point we
              // began recording asking prices at all.
              label={`Asking (tracked from ${formatDate(askingPoints[0].date)})`}
            />
          )}
        </div>
      )}
      <div className="h-48 w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-zinc-200 dark:stroke-zinc-700"
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(ts) => {
                const d = new Date(ts);
                const oneYear = 365 * 24 * 60 * 60 * 1000;
                if (lastTs - firstTs < oneYear * 3) {
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  });
                }
                return d.getFullYear().toString();
              }}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              domain={[Math.max(0, minPrice - padding), maxPrice + padding]}
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 11 }}
              width={55}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />

            {/*
              Declaration order is paint order, and it is load-bearing here.
              The asking series covers only the recent months, which is exactly
              where the sale dots bunch up, so drawing the scatter last buried
              the amber band under a pile of blue and made the line nearly
              impossible to hover. Sales go down first, asking on top.
            */}
            <Scatter dataKey="price" fill={SOLD_COLOR} fillOpacity={0.6} r={4} />

            {/* The quarter-to-three-quarter spread of what sellers are asking. */}
            {hasAsking && (
              <Area
                dataKey="askingBand"
                stroke={ASKING_COLOR}
                strokeOpacity={0.5}
                strokeWidth={1}
                fill={ASKING_COLOR}
                fillOpacity={0.22}
                connectNulls
                isAnimationActive={false}
                activeDot={false}
              />
            )}

            {hasSales && (
              <Line
                dataKey="trend"
                type="monotone"
                stroke={SOLD_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {hasAsking && (
              <Line
                dataKey="askingMedian"
                type="monotone"
                stroke={ASKING_COLOR}
                strokeWidth={2.5}
                dot={askingPoints.length < 10 ? { r: 3 } : false}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
