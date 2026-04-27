interface PriceEstimate {
  priceAverageLow: number | null;
  priceAverageHigh: number | null;
  priceVeryGoodLow: number | null;
  priceVeryGoodHigh: number | null;
  priceMintLow: number | null;
  priceMintHigh: number | null;
  medianPrice: number | null;
  currency: string | null;
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

const MS_PER_DAY = 86_400_000;

function formatMoney(n: number | null, currency = "USD") {
  if (n == null) return "—";
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

function quarterLabel(d: Date) {
  return `${d.getFullYear()}·Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function catmullRom(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildQuarterTicks(minMs: number, maxMs: number) {
  const ticks: Date[] = [];
  const start = new Date(minMs);
  start.setUTCDate(1);
  start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3);
  const d = new Date(start);
  while (d.getTime() <= maxMs) {
    ticks.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 3);
  }
  return ticks;
}

export function MarketBlock({
  estimate,
  history,
}: {
  estimate: PriceEstimate | null;
  history: PriceHistoryEntry[];
}) {
  const points = history
    .filter((h) => h.saleDate && h.priceUsd != null)
    .map((h) => ({ date: new Date(h.saleDate!), price: h.priceUsd! }))
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Keep points within ~12 months of the newest sale (skip entirely if no sales)
  let fallbackPoints = points;
  if (points.length > 0) {
    const newest = points[points.length - 1].date.getTime();
    const oneYearAgo = newest - 365 * MS_PER_DAY;
    const recent = points.filter((p) => p.date.getTime() >= oneYearAgo);
    fallbackPoints = recent.length > 0 ? recent : points;
  }

  const median =
    estimate?.medianPrice ??
    (fallbackPoints.length > 0
      ? (() => {
          const sorted = [...fallbackPoints].map((p) => p.price).sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0
            ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
            : sorted[mid];
        })()
      : null);

  const prices = fallbackPoints.map((p) => p.price);
  const rangeLow = prices.length > 0 ? Math.min(...prices) : null;
  const rangeHigh = prices.length > 0 ? Math.max(...prices) : null;
  const salesCount = fallbackPoints.length;
  const currency = estimate?.currency ?? "USD";

  // Chart dimensions
  const W = 600;
  const H = 120;
  const PAD_X = 8;
  const PAD_Y = 10;

  const chartPoints = fallbackPoints;
  const hasChart = chartPoints.length >= 2;

  let pathD = "";
  let bandD = "";
  let circles: { x: number; y: number }[] = [];
  let ticks: { x: number; label: string }[] = [];

  if (hasChart) {
    const tMin = chartPoints[0].date.getTime();
    const tMax = chartPoints[chartPoints.length - 1].date.getTime();
    const tSpan = Math.max(tMax - tMin, 1);

    const pMin = Math.min(...chartPoints.map((p) => p.price));
    const pMax = Math.max(...chartPoints.map((p) => p.price));
    const pSpan = Math.max(pMax - pMin, 1);

    const xOf = (ts: number) => PAD_X + ((ts - tMin) / tSpan) * (W - PAD_X * 2);
    const yOf = (price: number) =>
      PAD_Y + (1 - (price - pMin) / pSpan) * (H - PAD_Y * 2);

    circles = chartPoints.map((p) => ({ x: xOf(p.date.getTime()), y: yOf(p.price) }));

    // Bucket sales into equal time slices and compute P10 / P50 / P90 per bucket.
    const BUCKETS = Math.min(14, Math.max(6, Math.ceil(chartPoints.length / 3)));
    type Bucket = { center: number; prices: number[] };
    const buckets: Bucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
      center: tMin + ((i + 0.5) / BUCKETS) * tSpan,
      prices: [],
    }));
    for (const p of chartPoints) {
      const idx = Math.min(
        BUCKETS - 1,
        Math.floor(((p.date.getTime() - tMin) / tSpan) * BUCKETS),
      );
      buckets[idx].prices.push(p.price);
    }

    const quantile = (arr: number[], q: number) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      return sorted[base + 1] !== undefined
        ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
        : sorted[base];
    };

    // Forward-fill buckets that have no samples so the curve stays continuous.
    const filled: { x: number; hi: number; md: number; lo: number }[] = [];
    let lastHi: number | null = null;
    let lastMd: number | null = null;
    let lastLo: number | null = null;
    for (const b of buckets) {
      let hi: number | null = lastHi;
      let md: number | null = lastMd;
      let lo: number | null = lastLo;
      if (b.prices.length > 0) {
        hi = quantile(b.prices, 0.9);
        md = quantile(b.prices, 0.5);
        lo = quantile(b.prices, 0.1);
        lastHi = hi;
        lastMd = md;
        lastLo = lo;
      }
      if (md != null && hi != null && lo != null) {
        filled.push({ x: xOf(b.center), hi: yOf(hi), md: yOf(md), lo: yOf(lo) });
      }
    }

    // Back-fill any leading empty buckets with the first filled value.
    if (filled.length > 0 && filled[0].x > xOf(tMin)) {
      filled.unshift({ ...filled[0], x: xOf(tMin) });
    }
    if (filled.length > 0 && filled[filled.length - 1].x < xOf(tMax)) {
      filled.push({ ...filled[filled.length - 1], x: xOf(tMax) });
    }

    const medianPts = filled.map((p) => ({ x: p.x, y: p.md }));
    const hiPts = filled.map((p) => ({ x: p.x, y: p.hi }));
    const loPts = filled.map((p) => ({ x: p.x, y: p.lo }));

    pathD = catmullRom(medianPts);

    if (hiPts.length >= 2) {
      const hiPath = catmullRom(hiPts);
      const loReverse = catmullRom(loPts.slice().reverse());
      // Replace the leading "M" of the reversed path with an "L" to keep it joined.
      bandD = `${hiPath} ${loReverse.replace(/^M/, "L")} Z`;
    }

    ticks = buildQuarterTicks(tMin, tMax).map((d) => ({
      x: xOf(d.getTime()),
      label: quarterLabel(d),
    }));
  }

  if (median == null && !hasChart) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="grid grid-cols-3 gap-3.5 border-b border-border bg-[var(--surface-soft)] px-4 py-3.5">
        <Stat
          label="Median price"
          primary={formatMoney(median, currency)}
          unit={median != null ? currency : null}
        />
        <Stat
          label="Range (12mo)"
          primary={
            rangeLow != null && rangeHigh != null
              ? rangeLow === rangeHigh
                ? formatMoney(rangeLow, currency)
                : `${formatMoney(rangeLow, currency)}–${formatMoney(rangeHigh, currency)}`
              : "—"
          }
        />
        <Stat
          label="Sales observed"
          primary={salesCount > 0 ? salesCount.toLocaleString() : "—"}
        />
      </div>

      {hasChart ? (
        <>
          <div className="px-4 pt-4">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-[140px] w-full overflow-visible"
              aria-hidden="true"
            >
              <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--border)" strokeWidth="1" />
              <g stroke="var(--line-soft)" strokeDasharray="2 4">
                <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} />
                <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} />
                <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} />
              </g>
              <path d={bandD} fill="color-mix(in oklch, var(--foreground) 7%, transparent)" />
              <path d={pathD} fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
              {circles.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r="2" fill="var(--foreground)" opacity="0.45" />
              ))}
            </svg>
          </div>
          {ticks.length > 0 && (
            <div className="mono relative mx-4 mt-1 mb-3 h-4 text-[10px] text-[var(--fg-faint)]">
              {ticks.map((t) => (
                <span
                  key={t.label}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${(t.x / W) * 100}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mono px-4 py-6 text-[11px] text-[var(--fg-dim)]">
          Not enough sales observed to chart yet.
        </div>
      )}

      {(estimate?.rarity || estimate?.sourceName) && (
        <div className="mono flex items-center justify-between gap-3 border-t border-border bg-[var(--surface-soft)] px-4 py-2.5 text-[10px] text-[var(--fg-dim)]">
          {estimate?.rarity && (
            <span>
              <span className="text-[var(--fg-faint)]">rarity</span>{" "}
              <span className="text-foreground">{estimate.rarity.toLowerCase()}</span>
              {estimate.rarityVotes ? (
                <span className="text-[var(--fg-faint)]">
                  {" "}
                  · {estimate.rarityVotes} {estimate.rarityVotes === 1 ? "vote" : "votes"}
                </span>
              ) : null}
            </span>
          )}
          {estimate?.sourceName && estimate?.sourceUrl && (
            <a
              href={estimate.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--line-strong)] underline-offset-2 hover:text-foreground"
            >
              {estimate.sourceName}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  primary,
  unit,
}: {
  label: string;
  primary: string;
  unit?: string | null;
}) {
  return (
    <div>
      <div className="mono mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        {label}
      </div>
      <div className="text-[20px] font-medium leading-none -tracking-[0.02em]">
        {primary}
        {unit && (
          <span className="mono ml-1 align-baseline text-[11px] font-normal text-[var(--fg-dim)]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
