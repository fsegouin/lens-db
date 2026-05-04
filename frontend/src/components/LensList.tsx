"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { lenses, systems } from "@/db/schema";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight, Search, Star } from "lucide-react";
import { ScrollToTop } from "@/components/scroll-to-top";
import { trackEvent } from "@/lib/analytics";

type SeriesInfo = { name: string; slug: string };
type LensRow = {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
  series: SeriesInfo[];
  avgPrice: number | null;
};
type SystemOption = { name: string; slug: string };

type Props = {
  initialItems: LensRow[];
  initialTotal: number;
  initialNextCursor: number | null;
  brands: string[];
  systems: SystemOption[];
  seriesOptions: SeriesInfo[];
};

const TYPE_PRESETS = [
  { label: "Prime", value: "prime" },
  { label: "Zoom", value: "zoom" },
  { label: "Macro", value: "macro" },
];

const FOCAL_PRESETS = [
  { label: "Wide", min: "10", max: "35" },
  { label: "Normal", min: "35", max: "85" },
  { label: "Tele", min: "85", max: "300" },
  { label: "Super-tele", min: "300", max: "1200" },
];

const COVERAGES = [
  { label: "Full frame", value: "full-frame" },
  { label: "APS-C", value: "aps-c" },
  { label: "Micro 4/3", value: "micro-four-thirds" },
  { label: "Medium format", value: "medium-format" },
];

function FilterGroup({
  label,
  clearable,
  onClear,
  children,
}: {
  label: string;
  clearable?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[22px]">
      <div className="mono mb-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
        <span>{label}</span>
        {clearable && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] normal-case tracking-normal text-[var(--fg-dim)] hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function filterSelectClass(active: boolean) {
  return `filter-select w-full rounded-md border px-2.5 py-2 text-[13px] ${
    active
      ? "border-[var(--line-strong)] bg-background text-foreground"
      : "border-border bg-background text-[var(--fg-mid)]"
  } focus:border-foreground focus:outline-none`;
}

function formatFocal(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}mm`;
  return `${min ?? max}mm`;
}

function typeTag(lens: typeof lenses.$inferSelect) {
  if (lens.isZoom) return "zoom";
  if (lens.isMacro) return "macro";
  if (lens.lensType === "teleconverter") return "teleconverter";
  if (lens.isPrime) return "prime";
  return null;
}

export default function LensList({
  initialItems,
  initialTotal,
  initialNextCursor,
  brands,
  systems: systemOptions,
  seriesOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<LensRow[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const q = searchParams.get("q") || "";
  const brand = searchParams.get("brand") || "";
  const system = searchParams.get("system") || "";
  const type = searchParams.get("type") || "";
  const minFocal = searchParams.get("minFocal") || "";
  const maxFocal = searchParams.get("maxFocal") || "";
  const minAperture = searchParams.get("minAperture") || "";
  const maxAperture = searchParams.get("maxAperture") || "";
  const year = searchParams.get("year") || "";
  const lensType = searchParams.get("lensType") || "";
  const era = searchParams.get("era") || "";
  const productionStatus = searchParams.get("productionStatus") || "";
  const coverage = searchParams.get("coverage") || "";
  const series = searchParams.get("series") || "";
  const sort = searchParams.get("sort") || "";
  const order = searchParams.get("order") || "";
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";

  const [formQ, setFormQ] = useState(q);
  const [formMinFocal, setFormMinFocal] = useState(minFocal);
  const [formMaxFocal, setFormMaxFocal] = useState(maxFocal);
  const [formMinAperture, setFormMinAperture] = useState(minAperture);
  const [formMaxAperture, setFormMaxAperture] = useState(maxAperture);
  const [formYear, setFormYear] = useState(year);
  const [formPriceMin, setFormPriceMin] = useState(priceMin);
  const [formPriceMax, setFormPriceMax] = useState(priceMax);

  function dedupeLensRows(rows: LensRow[]) {
    const seen = new Set<number>();
    return rows.filter(({ lens }) => {
      if (seen.has(lens.id)) return false;
      seen.add(lens.id);
      return true;
    });
  }

  useEffect(() => {
    setFormQ(q);
    setFormMinFocal(minFocal);
    setFormMaxFocal(maxFocal);
    setFormMinAperture(minAperture);
    setFormMaxAperture(maxAperture);
    setFormYear(year);
    setFormPriceMin(priceMin);
    setFormPriceMax(priceMax);
  }, [q, minFocal, maxFocal, minAperture, maxAperture, year, priceMin, priceMax]);

  useEffect(() => {
    setItems(dedupeLensRows(initialItems));
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor, initialTotal]);

  const buildApiUrl = useCallback(
    (cursor: number) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (brand) params.set("brand", brand);
      if (system) params.set("system", system);
      if (type) params.set("type", type);
      if (minFocal) params.set("minFocal", minFocal);
      if (maxFocal) params.set("maxFocal", maxFocal);
      if (minAperture) params.set("minAperture", minAperture);
      if (maxAperture) params.set("maxAperture", maxAperture);
      if (year) params.set("year", year);
      if (lensType) params.set("lensType", lensType);
      if (era) params.set("era", era);
      if (productionStatus) params.set("productionStatus", productionStatus);
      if (coverage) params.set("coverage", coverage);
      if (series) params.set("series", series);
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      params.set("cursor", String(cursor));
      return `/api/lenses?${params.toString()}`;
    },
    [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year, lensType, era, productionStatus, coverage, series, sort, order, priceMin, priceMax],
  );

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(nextCursor));
      const data = await res.json();
      setItems((prev) => dedupeLensRows([...prev, ...data.items]));
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loading, nextCursor, buildApiUrl]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  type FilterOverrides = {
    q?: string;
    brand?: string;
    system?: string;
    type?: string;
    minFocal?: string;
    maxFocal?: string;
    minAperture?: string;
    maxAperture?: string;
    year?: string;
    lensType?: string;
    era?: string;
    productionStatus?: string;
    coverage?: string;
    series?: string;
    sort?: string;
    order?: string;
    priceMin?: string;
    priceMax?: string;
  };

  function applyFilters(overrides: FilterOverrides = {}) {
    const params = new URLSearchParams();
    const qVal = overrides?.q ?? formQ;
    const brandVal = overrides?.brand ?? brand;
    const systemVal = overrides?.system ?? system;
    const typeVal = overrides?.type ?? type;
    const minFocalVal = overrides?.minFocal ?? formMinFocal;
    const maxFocalVal = overrides?.maxFocal ?? formMaxFocal;
    const minApertureVal = overrides?.minAperture ?? formMinAperture;
    const maxApertureVal = overrides?.maxAperture ?? formMaxAperture;
    const yearVal = overrides?.year ?? formYear;
    const lensTypeVal = overrides?.lensType ?? lensType;
    const eraVal = overrides?.era ?? era;
    const productionStatusVal = overrides?.productionStatus ?? productionStatus;
    const coverageVal = overrides?.coverage ?? coverage;
    const seriesVal = overrides?.series ?? series;
    const sortVal = overrides?.sort ?? sort;
    const orderVal = overrides?.order ?? order;
    const priceMinVal = overrides?.priceMin ?? formPriceMin;
    const priceMaxVal = overrides?.priceMax ?? formPriceMax;
    if (qVal) params.set("q", qVal);
    if (brandVal) params.set("brand", brandVal);
    if (systemVal) params.set("system", systemVal);
    if (typeVal) params.set("type", typeVal);
    if (minFocalVal) params.set("minFocal", minFocalVal);
    if (maxFocalVal) params.set("maxFocal", maxFocalVal);
    if (minApertureVal) params.set("minAperture", minApertureVal);
    if (maxApertureVal) params.set("maxAperture", maxApertureVal);
    if (yearVal) params.set("year", yearVal);
    if (lensTypeVal) params.set("lensType", lensTypeVal);
    if (eraVal) params.set("era", eraVal);
    if (productionStatusVal) params.set("productionStatus", productionStatusVal);
    if (coverageVal) params.set("coverage", coverageVal);
    if (seriesVal) params.set("series", seriesVal);
    if (sortVal) params.set("sort", sortVal);
    if (orderVal) params.set("order", orderVal);
    if (priceMinVal) params.set("priceMin", priceMinVal);
    if (priceMaxVal) params.set("priceMax", priceMaxVal);
    const qs = params.toString();
    router.push(qs ? `/lenses?${qs}` : "/lenses");
  }

  function debouncedApply(overrides: FilterOverrides) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(overrides), 700);
  }

  function handleSort(column: string) {
    const nextOrder = sort === column ? (order === "asc" ? "desc" : "asc") : "asc";
    trackEvent("lens_sort_change", { column, order: nextOrder });
    applyFilters({ sort: column, order: nextOrder });
  }

  function clearAll() {
    router.push("/lenses");
  }

  const anyFilterActive =
    !!q ||
    !!brand ||
    !!system ||
    !!type ||
    !!lensType ||
    !!era ||
    !!productionStatus ||
    !!coverage ||
    !!series ||
    !!minFocal ||
    !!maxFocal ||
    !!minAperture ||
    !!maxAperture ||
    !!year ||
    !!priceMin ||
    !!priceMax;

  const SORT_OPTIONS: { label: string; key: string }[] = [
    { label: "Name", key: "name" },
    { label: "Rating", key: "rating" },
    { label: "Year", key: "year" },
    { label: "Focal length", key: "focalLength" },
    { label: "Aperture", key: "aperture" },
    { label: "Weight", key: "weight" },
    { label: "Price", key: "price" },
  ];

  const columns = [
    { key: "thumb", label: "", sortable: false, w: "44px" },
    { key: "name", label: "Lens", w: "minmax(0,2.6fr)" },
    { key: "system", label: "System", w: "minmax(0,1fr)" },
    { key: "focalLength", label: "Focal", w: "minmax(0,0.9fr)" },
    { key: "aperture", label: "ƒ", w: "minmax(0,0.6fr)" },
    { key: "weight", label: "Weight", w: "minmax(0,0.7fr)" },
    { key: "year", label: "Year", w: "minmax(0,0.6fr)" },
    { key: "rating", label: "Rating", w: "minmax(0,0.7fr)" },
    { key: "arrow", label: "", sortable: false, w: "28px" },
  ];
  const gridTemplate = columns.map((c) => c.w).join(" ");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      {/* Filters sidebar */}
      <aside className="lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-90px)] lg:overflow-y-auto lg:pr-2">
        <FilterGroup
          label="Brand"
          clearable={!!brand}
          onClear={() => applyFilters({ brand: "" })}
        >
          <select
            value={brand}
            onChange={(e) => {
              trackEvent("lens_filter_apply", { filter: "brand", value: e.target.value });
              applyFilters({ brand: e.target.value });
            }}
            className={filterSelectClass(!!brand)}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup
          label="Mount system"
          clearable={!!system}
          onClear={() => applyFilters({ system: "" })}
        >
          <select
            value={system}
            onChange={(e) => {
              trackEvent("lens_filter_apply", { filter: "system", value: e.target.value });
              applyFilters({ system: e.target.value });
            }}
            className={filterSelectClass(!!system)}
          >
            <option value="">All systems</option>
            {systemOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup
          label="Type"
          clearable={!!type || lensType === "teleconverter"}
          onClear={() => applyFilters({ type: "", lensType: "" })}
        >
          <div className="flex flex-wrap gap-1.5">
            {TYPE_PRESETS.map((p) => {
              const active = type === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => {
                    trackEvent("lens_filter_apply", { filter: "type", value: p.value });
                    applyFilters({ type: active ? "" : p.value, lensType: "" });
                  }}
                  className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              onClick={() => {
                const active = lensType === "teleconverter";
                applyFilters({ type: "", lensType: active ? "" : "teleconverter" });
              }}
              className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                lensType === "teleconverter"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
              }`}
            >
              Teleconverter
            </button>
          </div>
        </FilterGroup>

        <FilterGroup
          label="Focal length"
          clearable={!!minFocal || !!maxFocal}
          onClear={() => {
            setFormMinFocal("");
            setFormMaxFocal("");
            applyFilters({ minFocal: "", maxFocal: "" });
          }}
        >
          <div className="mono flex items-center gap-1.5 text-[11px]">
            <input
              type="number"
              value={formMinFocal}
              placeholder="From"
              onChange={(e) => {
                setFormMinFocal(e.target.value);
                debouncedApply({ minFocal: e.target.value });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
            />
            <span className="text-[var(--fg-faint)]">–</span>
            <input
              type="number"
              value={formMaxFocal}
              placeholder="To"
              onChange={(e) => {
                setFormMaxFocal(e.target.value);
                debouncedApply({ maxFocal: e.target.value });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
            />
            <span className="text-[var(--fg-dim)]">mm</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {FOCAL_PRESETS.map((p) => {
              const active = minFocal === p.min && maxFocal === p.max;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setFormMinFocal(active ? "" : p.min);
                    setFormMaxFocal(active ? "" : p.max);
                    applyFilters({
                      minFocal: active ? "" : p.min,
                      maxFocal: active ? "" : p.max,
                    });
                  }}
                  className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup
          label="Max aperture"
          clearable={!!minAperture || !!maxAperture}
          onClear={() => {
            setFormMinAperture("");
            setFormMaxAperture("");
            applyFilters({ minAperture: "", maxAperture: "" });
          }}
        >
          <div className="mono flex items-center gap-1.5 text-[11px]">
            <input
              type="number"
              step="0.1"
              value={formMinAperture}
              placeholder="ƒ/min"
              onChange={(e) => {
                setFormMinAperture(e.target.value);
                debouncedApply({ minAperture: e.target.value });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
            />
            <span className="text-[var(--fg-faint)]">–</span>
            <input
              type="number"
              step="0.1"
              value={formMaxAperture}
              placeholder="ƒ/max"
              onChange={(e) => {
                setFormMaxAperture(e.target.value);
                debouncedApply({ maxAperture: e.target.value });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
            />
          </div>
        </FilterGroup>

        <FilterGroup
          label="Coverage"
          clearable={!!coverage}
          onClear={() => applyFilters({ coverage: "" })}
        >
          <select
            value={coverage}
            onChange={(e) => {
              trackEvent("lens_filter_apply", { filter: "coverage", value: e.target.value });
              applyFilters({ coverage: e.target.value });
            }}
            className={filterSelectClass(!!coverage)}
          >
            <option value="">Any coverage</option>
            {COVERAGES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup
          label="Series"
          clearable={!!series}
          onClear={() => applyFilters({ series: "" })}
        >
          <select
            value={series}
            onChange={(e) => {
              trackEvent("lens_filter_apply", { filter: "series", value: e.target.value });
              applyFilters({ series: e.target.value });
            }}
            className={filterSelectClass(!!series)}
          >
            <option value="">All series</option>
            {seriesOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup
          label="Year / price"
          clearable={!!formYear || !!formPriceMin || !!formPriceMax}
          onClear={() => {
            setFormYear("");
            setFormPriceMin("");
            setFormPriceMax("");
            applyFilters({ year: "", priceMin: "", priceMax: "" });
          }}
        >
          <div className="mono space-y-2 text-[11px]">
            <input
              type="number"
              value={formYear}
              placeholder="Introduced (year)"
              onChange={(e) => {
                setFormYear(e.target.value);
                debouncedApply({ year: e.target.value });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={formPriceMin}
                placeholder="Min $"
                onChange={(e) => {
                  setFormPriceMin(e.target.value);
                  debouncedApply({ priceMin: e.target.value });
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
              />
              <span className="text-[var(--fg-faint)]">–</span>
              <input
                type="number"
                value={formPriceMax}
                placeholder="Max $"
                onChange={(e) => {
                  setFormPriceMax(e.target.value);
                  debouncedApply({ priceMax: e.target.value });
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground"
              />
            </div>
          </div>
        </FilterGroup>

        {anyFilterActive && (
          <button
            onClick={clearAll}
            className="mono w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] text-[var(--fg-mid)] transition-colors hover:border-[var(--line-strong)] hover:text-foreground"
          >
            Clear all filters
          </button>
        )}
      </aside>

      {/* Right: toolbar + table */}
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
            <Search className="size-4 text-[var(--fg-dim)]" strokeWidth={1.75} />
            <input
              value={formQ}
              onChange={(e) => {
                setFormQ(e.target.value);
                debouncedApply({ q: e.target.value });
              }}
              placeholder={`Filter within ${initialTotal.toLocaleString()} results…`}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[var(--fg-faint)]"
            />
            <span className="mono text-[10px] text-[var(--fg-faint)]">/</span>
          </div>
          <div className="mono inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[11px] text-[var(--fg-mid)]">
            <span className="text-[var(--fg-faint)]">sort</span>
            <select
              value={sort ? `${sort}:${order || "asc"}` : ""}
              onChange={(e) => {
                if (!e.target.value) {
                  applyFilters({ sort: "", order: "" });
                  return;
                }
                const [key, ord] = e.target.value.split(":");
                applyFilters({ sort: key, order: ord });
              }}
              className="filter-select cursor-pointer appearance-none border-none bg-transparent pr-5 text-[11px] text-foreground focus:outline-none"
            >
              <option value="">Default</option>
              {SORT_OPTIONS.flatMap((opt) => [
                { label: `${opt.label} ↑`, value: `${opt.key}:asc` },
                { label: `${opt.label} ↓`, value: `${opt.key}:desc` },
              ]).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-background">
            {/* Table head */}
            <div
              className="mono grid gap-3 border-b border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-dim)]"
              style={{ gridTemplateColumns: gridTemplate }}
              role="row"
            >
              {columns.map((col) => {
                const isSortable = col.sortable !== false && !!col.label;
                const isActive = sort === col.key;
                return (
                  <button
                    key={col.key}
                    type="button"
                    tabIndex={isSortable ? 0 : -1}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                    disabled={!isSortable}
                    className={`flex min-w-0 items-center gap-1 truncate text-left ${
                      isSortable ? "cursor-pointer hover:text-foreground" : ""
                    } ${isActive ? "text-foreground" : ""}`}
                  >
                    <span>{col.label}</span>
                    {isSortable &&
                      (isActive ? (
                        order === "desc" ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronUp className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      ))}
                  </button>
                );
              })}
            </div>

            {/* Rows */}
            <div>
              {items.map(({ lens, system: lensSystem }) => {
                const tag = typeTag(lens);
                const focal = formatFocal(lens.focalLengthMin, lens.focalLengthMax);
                return (
                  <Link
                    key={lens.id}
                    href={`/lenses/${lens.slug}`}
                    className="grid cursor-pointer items-center gap-3 border-b border-[var(--line-soft)] px-3.5 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-soft)]"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="hatch hatch-dense relative size-11 shrink-0 overflow-hidden rounded bg-[var(--surface-sunk)]" />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium -tracking-[0.01em]">
                        {lens.name}
                      </div>
                      <div className="mono mt-0.5 truncate text-[10px] tracking-[0.02em] text-[var(--fg-faint)]">
                        LDB 06-{String(lens.id).padStart(5, "0")}
                        {tag && (
                          <>
                            <span className="mx-1.5">·</span>
                            <span>{tag}</span>
                          </>
                        )}
                        {lens.brand && (
                          <>
                            <span className="mx-1.5">·</span>
                            <span>{lens.brand}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (!lensSystem) return;
                        e.preventDefault();
                        applyFilters({ system: lensSystem.slug });
                      }}
                      className="mono min-w-0 truncate text-[12px] text-[var(--fg-mid)] hover:text-foreground"
                    >
                      {lensSystem?.name ?? "—"}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (!focal || lens.focalLengthMin == null) return;
                        e.preventDefault();
                        applyFilters({
                          minFocal: String(lens.focalLengthMin),
                          maxFocal: String(lens.focalLengthMax ?? lens.focalLengthMin),
                        });
                      }}
                      className="mono min-w-0 truncate text-[12px] text-foreground hover:underline"
                    >
                      {focal ?? "—"}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (lens.apertureMin == null) return;
                        e.preventDefault();
                        applyFilters({
                          minAperture: String(lens.apertureMin),
                          maxAperture: String(lens.apertureMin),
                        });
                      }}
                      className="mono min-w-0 truncate text-[12px] text-foreground hover:underline"
                    >
                      {lens.apertureMin != null ? `ƒ/${lens.apertureMin}` : "—"}
                    </span>
                    <span className="mono min-w-0 truncate text-[12px] text-[var(--fg-mid)]">
                      {lens.weightG != null ? `${Math.round(lens.weightG)}g` : "—"}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (!lens.yearIntroduced) return;
                        e.preventDefault();
                        applyFilters({ year: String(lens.yearIntroduced) });
                      }}
                      className="mono min-w-0 truncate text-[12px] text-[var(--fg-mid)] hover:text-foreground"
                    >
                      {lens.yearIntroduced ?? "—"}
                    </span>
                    <span className="mono flex min-w-0 items-center gap-1 truncate text-[12px] text-[var(--hot)]">
                      {lens.averageRating != null ? (
                        <>
                          <Star className="size-2.5 fill-current" />
                          {lens.averageRating.toFixed(1)}
                        </>
                      ) : (
                        <span className="text-[var(--fg-faint)]">—</span>
                      )}
                    </span>
                    <ChevronRight className="size-4 justify-self-end text-[var(--fg-faint)]" />
                  </Link>
                );
              })}
              {loading && (
                <div className="mono p-4 text-center text-[11px] text-[var(--fg-dim)]">
                  Loading more…
                </div>
              )}
              {nextCursor !== null && <div ref={sentinelRef} className="h-px w-full" />}
            </div>
          </div>
        ) : (
          <div className="mono rounded-[10px] border border-dashed border-border px-6 py-12 text-center text-[11px] text-[var(--fg-dim)]">
            No lenses match those filters.
          </div>
        )}

        <div className="mono mt-4 flex items-center justify-between px-1 text-[11px] text-[var(--fg-dim)]">
          <span>
            Showing <span className="text-foreground">{items.length.toLocaleString()}</span> of{" "}
            {initialTotal.toLocaleString()}
          </span>
          <span>Scroll for more · infinite scroll enabled</span>
        </div>

        <ScrollToTop />
      </div>
    </div>
  );
}
