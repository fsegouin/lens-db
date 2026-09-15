"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface PriceHistoryEntry {
  saleDate: string | null;
  condition: string | null;
  priceUsd: number | null;
}

interface PriceChartProps {
  history: PriceHistoryEntry[];
}

const SOLD_COLOR = "#3b82f6";
const HOUR_MS = 3_600_000;
const SIX_MONTHS_MS = 180 * 24 * HOUR_MS;
const ONE_YEAR_MS = 365 * 24 * HOUR_MS;

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

  // Every row is a sale; the guard only narrows the optional field.
  if (row.price == null) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">
        ${row.price.toLocaleString()}
      </p>
      <p className="text-muted-foreground">Sold {formatDate(row.date)}</p>
      {row.condition && (
        <p className="text-xs text-muted-foreground">
          {CONDITION_LABELS[row.condition] ?? row.condition}
        </p>
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

export default function PriceChart({ history }: PriceChartProps) {
  const rawSales = history
    .filter(
      (e): e is PriceHistoryEntry & { saleDate: string; priceUsd: number } =>
        !!e.saleDate && e.priceUsd != null,
    )
    .map((e) => ({
      date: e.saleDate,
      price: e.priceUsd,
      condition: e.condition,
      timestamp: toTimestamp(e.saleDate),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Offset same-date sales slightly so each dot is individually hoverable.
  const seen = new Map<number, number>();
  const sales = rawSales.map((p) => {
    const count = seen.get(p.timestamp) ?? 0;
    seen.set(p.timestamp, count + 1);
    return { ...p, timestamp: p.timestamp + count * HOUR_MS };
  });

  if (sales.length < 2) return null;

  // Rolling average over the sales, so the trend reads through the scatter.
  const span = sales[sales.length - 1].timestamp - sales[0].timestamp;
  const windowMs = Math.max(SIX_MONTHS_MS, span * 0.15);
  const rows: ChartRow[] = sales.map((p) => {
    const nearby = sales.filter(
      (o) => Math.abs(o.timestamp - p.timestamp) <= windowMs / 2,
    );
    return {
      timestamp: p.timestamp,
      date: p.date,
      price: p.price,
      condition: p.condition,
      trend: Math.round(nearby.reduce((s, o) => s + o.price, 0) / nearby.length),
    };
  });

  const values = sales.map((p) => p.price);
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

  const label = `Chart of ${sales.length} recorded sale prices`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendKey color={SOLD_COLOR} label="Sold" />
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} title={label} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
                if (lastTs - firstTs < ONE_YEAR_MS * 3) {
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

            <Scatter dataKey="price" fill={SOLD_COLOR} fillOpacity={0.6} r={4} />

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

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
