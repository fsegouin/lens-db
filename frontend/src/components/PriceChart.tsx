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

interface PriceHistoryEntry {
  saleDate: string | null;
  condition: string | null;
  priceUsd: number | null;
  source: string | null;
}

interface PriceChartProps {
  history: PriceHistoryEntry[];
}

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

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { date: string; price: number; condition: string | null; source: string | null } }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">
        ${data.price.toLocaleString()}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {formatDate(data.date)}
      </p>
      {data.condition && (
        <p className="text-zinc-500 dark:text-zinc-400">
          {CONDITION_LABELS[data.condition] ?? data.condition}
        </p>
      )}
      {data.source && (
        <p className="text-zinc-400 dark:text-zinc-500 text-xs">
          {data.source}
        </p>
      )}
    </div>
  );
}

export default function PriceChart({ history }: PriceChartProps) {
  // Filter to entries with both date and price, sort chronologically
  const points = history
    .filter((e) => e.saleDate && e.priceUsd != null)
    .map((e) => ({
      date: e.saleDate!,
      price: e.priceUsd!,
      condition: e.condition,
      source: e.source,
      // Numeric timestamp for X axis
      timestamp: new Date(e.saleDate! + "T00:00:00").getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (points.length < 2) return null;

  // Build a smooth trend line by computing time-weighted rolling averages.
  // For each point, average all points within a time window (6 months by default,
  // scaled up if the data spans many years).
  const timeSpanMs = points[points.length - 1].timestamp - points[0].timestamp;
  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  // Use a window that's ~15% of the total time span, but at least 6 months
  const windowMs = Math.max(sixMonthsMs, timeSpanMs * 0.15);

  const trendPoints = points.map((p) => {
    const nearby = points.filter(
      (other) => Math.abs(other.timestamp - p.timestamp) <= windowMs / 2
    );
    const avg = Math.round(
      nearby.reduce((sum, s) => sum + s.price, 0) / nearby.length
    );
    return { ...p, trend: avg };
  });

  const minPrice = Math.min(...points.map((p) => p.price));
  const maxPrice = Math.max(...points.map((p) => p.price));
  const padding = Math.max(10, Math.round((maxPrice - minPrice) * 0.1));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trendPoints} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts) => {
              const d = new Date(ts);
              const span = points[points.length - 1].timestamp - points[0].timestamp;
              const oneYear = 365 * 24 * 60 * 60 * 1000;
              // Show month+year if data spans less than 3 years, otherwise just year
              if (span < oneYear * 3) {
                return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
              }
              return d.getFullYear().toString();
            }}
            tick={{ fontSize: 11 }}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <YAxis
            domain={[Math.max(0, minPrice - padding), maxPrice + padding]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 11 }}
            width={55}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            dataKey="trend"
            type="monotone"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
          <Scatter
            dataKey="price"
            fill="#3b82f6"
            fillOpacity={0.6}
            r={4}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
