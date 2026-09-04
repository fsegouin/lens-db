"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { lenses, systems } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { normalizeLensType } from "@/lib/vocabularies";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { TableSkeleton } from "@/components/table-skeleton";
import { ScrollToTop } from "@/components/scroll-to-top";
import { trackEvent } from "@/lib/analytics";

type SeriesInfo = { name: string; slug: string };

type LensRow = {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
  series: SeriesInfo[];
  mounts?: SystemOption[];
  avgPrice: number | null;
};

type SystemOption = { name: string; slug: string };

// Table cells are nowrap, so the System column is capped to a fixed width:
// the primary mount is shown by its short name (no parenthetical suffix,
// e.g. "Leica Screw Mount" for "Leica Screw Mount (M39 / LTM)") and
// truncated with an ellipsis; extra mounts collapse into a "+N" chip that
// expands on click. The full names sit in the title tooltip, and every
// mount stays a clickable filter.
const shortMountName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "");

function MountsCell({ mounts, onSelect }: { mounts: SystemOption[]; onSelect: (slug: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (mounts.length === 0) return <>{"—"}</>;
  const shown = expanded ? mounts : mounts.slice(0, 1);
  const hidden = mounts.length - shown.length;
  const linkClass = "text-left hover:text-foreground hover:underline";
  return (
    <span
      className={expanded ? "inline-flex max-w-[11rem] flex-wrap items-baseline gap-x-1 whitespace-normal" : "inline-flex max-w-[11rem] items-baseline gap-x-1"}
      title={mounts.map((m) => m.name).join(", ")}
    >
      {shown.map((m, i) => (
        <span key={m.slug} className={expanded ? "" : "min-w-0 truncate"}>
          <button type="button" onClick={() => onSelect(m.slug)} className={linkClass}>
            {shortMountName(m.name)}
          </button>
          {i < shown.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 rounded bg-muted px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          +{hidden}
        </button>
      )}
    </span>
  );
}

type Props = {
  initialItems: LensRow[];
  initialTotal: number;
  initialNextCursor: number | null;
  brands: string[];
  systems: SystemOption[];
  seriesOptions: SeriesInfo[];
};

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the list resets so late loadMore responses are discarded
  const listGenRef = useRef(0);

  // Current filter values from URL
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
  // The server defaults to year descending (newest first) when no sort is
  // given; mirror that here so the header indicator and click-to-toggle treat
  // it as explicit. The default is kept out of URLs so /lenses stays canonical.
  const DEFAULT_SORT = "year";
  const DEFAULT_ORDER = "desc";
  const sort = searchParams.get("sort") || DEFAULT_SORT;
  const order = searchParams.get("order") || DEFAULT_ORDER;
  const isDefaultSort = (s: string, o: string) => s === DEFAULT_SORT && o === DEFAULT_ORDER;
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";

  // Form state
  const [formQ, setFormQ] = useState(q);
  const [formBrand, setFormBrand] = useState(brand);
  const [formSystem, setFormSystem] = useState(system);
  const [formType, setFormType] = useState(type);
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

  // Sync form state when URL params change (e.g. back/forward navigation)
  useEffect(() => {
    setFormQ(q);
    setFormBrand(brand);
    setFormSystem(system);
    setFormType(type);
    setFormMinFocal(minFocal);
    setFormMaxFocal(maxFocal);
    setFormMinAperture(minAperture);
    setFormMaxAperture(maxAperture);
    setFormYear(year);
    setFormPriceMin(priceMin);
    setFormPriceMax(priceMax);
  }, [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year, priceMin, priceMax]);

  // Reset list when initial data changes (filters applied via server component)
  useEffect(() => {
    listGenRef.current += 1;
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
      if (!isDefaultSort(sort, order)) {
        params.set("sort", sort);
        params.set("order", order);
      }
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      params.set("cursor", String(cursor));
      return `/api/lenses?${params.toString()}`;
    },
    [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year, lensType, era, productionStatus, coverage, series, sort, order, priceMin, priceMax]
  );

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;
    const gen = listGenRef.current;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(nextCursor));
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (gen !== listGenRef.current) return;
      setItems((prev) => dedupeLensRows([...prev, ...data.items]));
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to load more lenses:", err);
    } finally {
      setLoading(false);
    }
  }, [loading, nextCursor, buildApiUrl]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  function applyFilters(overrides: { q?: string; brand?: string; system?: string; type?: string; minFocal?: string; maxFocal?: string; minAperture?: string; maxAperture?: string; year?: string; lensType?: string; era?: string; productionStatus?: string; coverage?: string; series?: string; sort?: string; order?: string; priceMin?: string; priceMax?: string } = {}) {
    const params = new URLSearchParams();
    const qVal = overrides?.q ?? formQ;
    const brandVal = overrides?.brand ?? formBrand;
    const systemVal = overrides?.system ?? formSystem;
    const typeVal = overrides?.type ?? formType;
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
    if (!isDefaultSort(sortVal, orderVal)) {
      params.set("sort", sortVal);
      params.set("order", orderVal);
    }
    if (priceMinVal) params.set("priceMin", priceMinVal);
    if (priceMaxVal) params.set("priceMax", priceMaxVal);
    const qs = params.toString();
    router.push(qs ? `/lenses?${qs}` : "/lenses");
  }

  function debouncedApply(overrides: Parameters<typeof applyFilters>[0]) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(overrides), 700);
  }

  function handleSort(column: string) {
    // A fresh click on Year starts newest-first to match the default view.
    const nextOrder = sort === column ? (order === "asc" ? "desc" : "asc") : column === "year" ? "desc" : "asc";
    trackEvent("lens_sort_change", { column, order: nextOrder });
    applyFilters({ sort: column, order: nextOrder });
  }

  function handleSearchChange(value: string) {
    setFormQ(value);
    debouncedApply({ q: value });
  }

  type LensFilters = Parameters<typeof applyFilters>[0];

  /** Everything the panel hides, since the chips report the rest. */
  const hiddenFilterCount = [type, lensType, coverage, series, year].filter(
    Boolean,
  ).length;

  const clearAll: LensFilters = {
    q: "", brand: "", system: "", type: "", series: "", coverage: "",
    minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "",
    priceMin: "", priceMax: "", lensType: "", era: "", productionStatus: "",
  };

  const systemName = systemOptions.find((s) => s.slug === system)?.name ?? system;
  const seriesName = seriesOptions.find((s) => s.slug === series)?.name ?? series;

  /**
   * Built from the URL, not the form. lensType, era and productionStatus
   * arrive from badge links on entity pages and have no control here, so
   * without a chip there was no way to see or undo them.
   */
  const chips: { key: string; label: string; value: string; clear: LensFilters }[] = [];
  const range = (lo: string, hi: string, unit: string) =>
    lo && hi ? `${lo}\u2013${hi}${unit}` : lo ? `from ${lo}${unit}` : `up to ${hi}${unit}`;

  if (q) chips.push({ key: "q", label: "Search", value: q, clear: { q: "" } });
  if (brand) chips.push({ key: "brand", label: "Brand", value: brand, clear: { brand: "" } });
  if (system) chips.push({ key: "system", label: "Mount", value: systemName, clear: { system: "" } });
  if (minFocal || maxFocal) {
    chips.push({ key: "focal", label: "Focal", value: range(minFocal, maxFocal, "mm"), clear: { minFocal: "", maxFocal: "" } });
  }
  if (minAperture || maxAperture) {
    chips.push({ key: "aperture", label: "Aperture", value: `f/${range(minAperture, maxAperture, "")}`, clear: { minAperture: "", maxAperture: "" } });
  }
  if (priceMin || priceMax) {
    chips.push({
      key: "price",
      label: "Price",
      value: priceMin && priceMax ? `$${priceMin}\u2013$${priceMax}` : priceMin ? `from $${priceMin}` : `up to $${priceMax}`,
      clear: { priceMin: "", priceMax: "" },
    });
  }
  if (type) chips.push({ key: "type", label: "Type", value: type, clear: { type: "" } });
  if (coverage) chips.push({ key: "coverage", label: "Coverage", value: coverage, clear: { coverage: "" } });
  if (series) chips.push({ key: "series", label: "Series", value: seriesName, clear: { series: "" } });
  if (year) chips.push({ key: "year", label: "Year", value: year, clear: { year: "" } });
  if (lensType) {
    chips.push({
      key: "lensType",
      label: "Lens type",
      value: normalizeLensType(lensType) ?? lensType,
      clear: { lensType: "" },
    });
  }
  if (era) chips.push({ key: "era", label: "Era", value: era, clear: { era: "" } });
  if (productionStatus) {
    chips.push({ key: "productionStatus", label: "Status", value: productionStatus, clear: { productionStatus: "" } });
  }


  // Series is filled on about a fifth of rows; a column that is mostly blank
  // is width taken from the name, which is the only unique identifier here.
  const showSeries = items.some((l) => (l.series?.length ?? 0) > 0);
  const colCount = showSeries ? 10 : 9;

  return (
    <>
      {/* Same shape as the camera bar: search, the facets people browse by,
          the rest on demand, then what is applied. */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="lens-search">Search lenses</label>
          <Input
            id="lens-search"
            type="text"
            placeholder="Search lenses..."
            value={formQ}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-11 flex-1 sm:h-10"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="lens-more-filters"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors sm:h-10 hover:border-ring"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="max-sm:sr-only">
              {filtersOpen ? "Fewer filters" : "More filters"}
            </span>
            {hiddenFilterCount > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {hiddenFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label htmlFor="lens-brand" className="block text-xs font-medium text-muted-foreground">Brand</label>
            <select
              id="lens-brand"
              value={formBrand}
              onChange={(e) => { setFormBrand(e.target.value); trackEvent("lens_filter_apply", { filter: "brand", value: e.target.value }); applyFilters({ brand: e.target.value }); }}
              className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lens-system" className="block text-xs font-medium text-muted-foreground">Mount</label>
            <select
              id="lens-system"
              value={formSystem}
              onChange={(e) => { setFormSystem(e.target.value); trackEvent("lens_filter_apply", { filter: "system", value: e.target.value }); applyFilters({ system: e.target.value }); }}
              className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All systems</option>
              {systemOptions.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <span id="lens-focal-label" className="block text-xs font-medium text-muted-foreground">Focal length (mm)</span>
            <div className="flex items-center gap-1.5" role="group" aria-labelledby="lens-focal-label">
              <Input
                id="lens-min-focal"
                type="number"
                placeholder="From"
                aria-label="Minimum focal length in mm"
                value={formMinFocal}
                onChange={(e) => { setFormMinFocal(e.target.value); debouncedApply({ minFocal: e.target.value }); }}
                className="h-10 w-full"
              />
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">&ndash;</span>
              <Input
                id="lens-max-focal"
                type="number"
                placeholder="To"
                aria-label="Maximum focal length in mm"
                value={formMaxFocal}
                onChange={(e) => { setFormMaxFocal(e.target.value); debouncedApply({ maxFocal: e.target.value }); }}
                className="h-10 w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span id="lens-aperture-label" className="block text-xs font-medium text-muted-foreground">Max aperture</span>
            <div className="flex items-center gap-1.5" role="group" aria-labelledby="lens-aperture-label">
              <Input
                id="lens-min-aperture"
                type="number"
                step="0.1"
                placeholder="From"
                aria-label="Widest maximum aperture"
                value={formMinAperture}
                onChange={(e) => { setFormMinAperture(e.target.value); debouncedApply({ minAperture: e.target.value }); }}
                className="h-10 w-full"
              />
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">&ndash;</span>
              <Input
                id="lens-max-aperture"
                type="number"
                step="0.1"
                placeholder="To"
                aria-label="Narrowest maximum aperture"
                value={formMaxAperture}
                onChange={(e) => { setFormMaxAperture(e.target.value); debouncedApply({ maxAperture: e.target.value }); }}
                className="h-10 w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span id="lens-price-label" className="block text-xs font-medium text-muted-foreground">Price (USD)</span>
            <div className="flex items-center gap-1.5" role="group" aria-labelledby="lens-price-label">
              <Input
                id="lens-price-min"
                type="number"
                placeholder="Min"
                aria-label="Minimum price in USD"
                value={formPriceMin}
                onChange={(e) => { setFormPriceMin(e.target.value); debouncedApply({ priceMin: e.target.value }); }}
                className="h-10 w-full"
              />
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">&ndash;</span>
              <Input
                id="lens-price-max"
                type="number"
                placeholder="Max"
                aria-label="Maximum price in USD"
                value={formPriceMax}
                onChange={(e) => { setFormPriceMax(e.target.value); debouncedApply({ priceMax: e.target.value }); }}
                className="h-10 w-full"
              />
            </div>
          </div>
        </div>

        <div
          id="lens-more-filters"
          className={`${filtersOpen ? "grid" : "hidden"} grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4`}
        >
          <div className="space-y-1.5">
            <label htmlFor="lens-type" className="block text-xs font-medium text-muted-foreground">Lens type</label>
            <select
              id="lens-type"
              value={lensType?.toLowerCase() === "teleconverter" ? "teleconverter" : formType}
              onChange={(e) => {
                const val = e.target.value;
                trackEvent("lens_filter_apply", { filter: "type", value: val });
                if (val === "teleconverter") {
                  setFormType("");
                  applyFilters({ type: "", lensType: "teleconverter" });
                } else {
                  setFormType(val);
                  applyFilters({ type: val, lensType: "" });
                }
              }}
              className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All lens types</option>
              <option value="prime">Prime</option>
              <option value="zoom">Zoom</option>
              <option value="macro">Macro</option>
              <option value="teleconverter">Teleconverter</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lens-coverage" className="block text-xs font-medium text-muted-foreground">Coverage</label>
            <select
              id="lens-coverage"
              value={coverage}
              onChange={(e) => { trackEvent("lens_filter_apply", { filter: "coverage", value: e.target.value }); applyFilters({ coverage: e.target.value }); }}
              className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All coverage</option>
              <option value="full-frame">Full Frame</option>
              <option value="aps-c">APS-C</option>
              <option value="micro-four-thirds">Micro Four Thirds</option>
              <option value="medium-format">Medium Format</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lens-series" className="block text-xs font-medium text-muted-foreground">Series</label>
            <select
              id="lens-series"
              value={series}
              onChange={(e) => { trackEvent("lens_filter_apply", { filter: "series", value: e.target.value }); applyFilters({ series: e.target.value }); }}
              className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All series</option>
              {seriesOptions.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lens-year" className="block text-xs font-medium text-muted-foreground">Year introduced</label>
            <Input
              id="lens-year"
              type="number"
              placeholder="e.g. 1996"
              value={formYear}
              onChange={(e) => { setFormYear(e.target.value); debouncedApply({ year: e.target.value }); }}
              className="h-10 w-full"
            />
          </div>
        </div>

        {/* Includes lensType, era and productionStatus, which arrive from badge
            links on entity pages and have no control anywhere on this page.
            Without these chips a visitor could not see or undo them. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => applyFilters(chip.clear)}
                aria-label={`Remove filter ${chip.label} ${chip.value}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background pr-2.5 pl-3 text-xs transition-colors hover:border-ring hover:text-foreground"
              >
                <span className="text-muted-foreground">{chip.label}</span>
                <span className="text-foreground">{chip.value}</span>
                <X className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyFilters(clearAll)}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results: cards on a phone, the full table from xl up. A 1,008px table
          in a 358px viewport scrolled sideways and detached names from values. */}
      {items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border xl:hidden">
          {items.map(({ lens, system, mounts = [], avgPrice }) => {
            const focal = lens.focalLengthMin
              ? lens.focalLengthMin === lens.focalLengthMax
                ? `${lens.focalLengthMin}mm`
                : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
              : null;
            const specLine = [
              focal,
              lens.apertureMin ? `f/${lens.apertureMin}` : null,
              lens.weightG ? `${lens.weightG}g` : null,
              lens.yearIntroduced,
            ]
              .filter(Boolean)
              .join(" · ");
            const mountName = mounts[0]?.name ?? system?.name ?? null;
            return (
              <li key={lens.id}>
                <Link
                  href={`/lenses/${lens.slug}`}
                  className="flex flex-col gap-1.5 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium leading-snug">{lens.name}</span>
                  {specLine && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {specLine}
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-3">
                    {mountName ? (
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
                        {mountName}
                        {mounts.length > 1 && (
                          <span className="text-muted-foreground"> +{mounts.length - 1}</span>
                        )}
                      </span>
                    ) : (
                      <span />
                    )}
                    {avgPrice != null && (
                      <span className="font-mono text-sm tabular-nums">
                        ${avgPrice.toLocaleString()}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* The skeleton lives inside the desktop wrapper, so without this the
          card list had no sign that more rows were on the way. */}
      {loading && (
        <p className="py-3 text-center text-sm text-muted-foreground xl:hidden">
          Loading more...
        </p>
      )}

      {items.length > 0 ? (
        <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {[
                { key: "name", label: "Name", className: "w-[28%]" },
                { key: "brand", label: "Brand", className: showSeries ? "w-[10%]" : "w-[11%]" },
                { key: "system", label: "System", className: showSeries ? "w-[10%]" : "w-[12%]" },
                { key: "focalLength", label: "Focal Length", className: showSeries ? "w-[8%] text-right" : "w-[10%] text-right" },
                { key: "aperture", label: "Aperture", className: showSeries ? "w-[8%] text-right" : "w-[9%] text-right" },
                { key: "type", label: "Type", sortable: false, className: showSeries ? "w-[6%]" : "w-[8%]" },
                ...(showSeries
                  ? [{ key: "series", label: "Series", sortable: false, className: "w-[10%]" }]
                  : []),
                { key: "year", label: "Year", className: showSeries ? "w-[5%] text-right" : "w-[6%] text-right" },
                { key: "price", label: "Avg Price", className: showSeries ? "w-[8%] text-right" : "w-[9%] text-right" },
                { key: "weight", label: "Weight", className: "w-[7%] text-right" },
              ].map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={`${col.sortable !== false ? "cursor-pointer select-none hover:text-foreground" : ""} ${"className" in col ? col.className : ""}`}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  tabIndex={col.sortable !== false ? 0 : -1}
                  aria-sort={
                    col.sortable === false
                      ? undefined
                      : sort === col.key
                        ? order === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                  }
                  onKeyDown={
                    col.sortable !== false
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSort(col.key);
                          }
                        }
                      : undefined
                  }
                >
                  {col.label}
                  {col.sortable !== false && (
                    sort === col.key
                      ? (order === "desc" ? <ChevronDown className="ml-1 inline h-3 w-3" /> : <ChevronUp className="ml-1 inline h-3 w-3" />)
                      : <ChevronsUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(({ lens, system, series: lensSeries, mounts = [], avgPrice }) => (
              <TableRow key={lens.id}>
                <TableCell className="max-w-[22rem] whitespace-normal">
                  <Link
                    href={`/lenses/${lens.slug}`}
                    className="block break-words leading-snug font-medium text-foreground hover:underline line-clamp-2"
                  >
                    {lens.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lens.brand ? (
                    <button type="button"
                      onClick={() => applyFilters({ brand: lens.brand!, system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                      className="text-left hover:text-foreground hover:underline"
                    >
                      {lens.brand}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <MountsCell
                    mounts={mounts.length > 0 ? mounts : system ? [{ name: system.name, slug: system.slug }] : []}
                    onSelect={(slug) => applyFilters({ system: slug, brand: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                  />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {lens.focalLengthMin ? (
                    <button type="button"
                      onClick={() => applyFilters({ minFocal: String(lens.focalLengthMin), maxFocal: String(lens.focalLengthMax ?? lens.focalLengthMin), brand: "", system: "", q: "", type: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                      className="text-left hover:text-foreground hover:underline"
                    >
                      {lens.focalLengthMin === lens.focalLengthMax
                        ? `${lens.focalLengthMin}mm`
                        : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {lens.apertureMin ? (
                    <button type="button"
                      onClick={() => applyFilters({ minAperture: String(lens.apertureMin), maxAperture: String(lens.apertureMin), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", year: "", coverage: "" })}
                      className="text-left hover:text-foreground hover:underline"
                    >
                      f/{lens.apertureMin}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                  {lens.isZoom && (
                    <Badge
                      variant="zoom"
                      className="min-w-[3.25rem] cursor-pointer justify-center"
                      onClick={() => applyFilters({ type: "zoom", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", series: "", coverage: "" })}
                    >
                      Zoom
                    </Badge>
                  )}
                  {lens.isPrime && (
                    <Badge
                      variant="prime"
                      className="min-w-[3.25rem] cursor-pointer justify-center"
                      onClick={() => applyFilters({ type: "prime", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", series: "", coverage: "" })}
                    >
                      Prime
                    </Badge>
                  )}
                  {lens.isMacro && (
                    <Badge
                      variant="macro"
                      className="min-w-[3.25rem] cursor-pointer justify-center"
                      onClick={() => applyFilters({ type: "macro", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", series: "", coverage: "" })}
                    >
                      Macro
                    </Badge>
                  )}
                  {lens.lensType?.toLowerCase() === "teleconverter" && (
                    <Badge
                      variant="teleconverter"
                      className="min-w-[3.25rem] cursor-pointer justify-center"
                      onClick={() => applyFilters({ type: "", lensType: "teleconverter", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", era: "", productionStatus: "", series: "", coverage: "" })}
                    >
                      TC
                    </Badge>
                  )}
                  </div>
                </TableCell>
                {/* Gated on the same flag as its header, or every value to
                    the right of it shifts one column. */}
                {showSeries && (
                  <TableCell>
                    {lensSeries.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lensSeries.map((s) => (
                          <Badge
                            key={s.slug}
                            variant="series"
                            className="cursor-pointer"
                            onClick={() => applyFilters({ series: s.slug, brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                          >
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {lens.yearIntroduced ? (
                    <button type="button"
                      onClick={() => applyFilters({ year: String(lens.yearIntroduced), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", coverage: "" })}
                      className="text-left hover:text-foreground hover:underline"
                    >
                      {lens.yearIntroduced}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {avgPrice != null
                    ? `$${avgPrice.toLocaleString()}`
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {lens.weightG ? `${lens.weightG}g` : "\u2014"}
                </TableCell>
              </TableRow>
            ))}
            {loading && <TableSkeleton columns={colCount} rows={3} />}
          </TableBody>
        </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">
            No lenses found.
          </p>
        </div>
      )}
      {/* Outside both layouts, so one observer serves the table and the cards.
          Inside the table it was inert wherever the table was hidden, which
          capped every phone at the first page. */}
      {nextCursor !== null && <div ref={sentinelRef} className="h-px w-full" />}

      <ScrollToTop />
    </>
  );
}
