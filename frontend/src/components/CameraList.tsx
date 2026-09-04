"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { cameras, systems } from "@/db/schema";
import { Input } from "@/components/ui/input";
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

type CameraRow = {
  camera: typeof cameras.$inferSelect;
  system: typeof systems.$inferSelect | null;
  avgPrice: number | null;
};

type SystemOption = { name: string; slug: string };

type Props = {
  initialItems: CameraRow[];
  initialTotal: number;
  initialNextCursor: number | null;
  systems?: SystemOption[];
  sensorSizes?: string[];
  types?: string[];
  models?: string[];
  filmTypes?: string[];
  sensorTypes?: string[];
  cropFactors?: string[];
};

type FilterOverrides = {
  q?: string;
  system?: string;
  sensorSize?: string;
  type?: string;
  model?: string;
  filmType?: string;
  sensorType?: string;
  cropFactor?: string;
  year?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
};

export default function CameraList({
  initialItems,
  initialTotal,
  initialNextCursor,
  systems: systemOptions = [],
  sensorSizes = [],
  types = [],
  models = [],
  filmTypes = [],
  sensorTypes = [],
  cropFactors = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<CameraRow[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the list resets so late loadMore responses are discarded
  const listGenRef = useRef(0);

  // Current filter values from URL
  const q = searchParams.get("q") || "";
  const system = searchParams.get("system") || "";
  const sensorSize = searchParams.get("sensorSize") || "";
  const type = searchParams.get("type") || "";
  const model = searchParams.get("model") || "";
  const filmType = searchParams.get("filmType") || "";
  const filmTypeList = filmType ? filmType.split(",").filter(Boolean) : [];
  const sensorType = searchParams.get("sensorType") || "";
  const cropFactor = searchParams.get("cropFactor") || "";
  const year = searchParams.get("year") || "";
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";
  // The server defaults to year descending (newest first) when no sort is
  // given; mirror that here so the header indicator and click-to-toggle treat
  // it as explicit. The default is kept out of URLs so /cameras stays canonical.
  const DEFAULT_SORT = "year";
  const DEFAULT_ORDER = "desc";
  const sort = searchParams.get("sort") || DEFAULT_SORT;
  const order = searchParams.get("order") || DEFAULT_ORDER;
  const isDefaultSort = (s: string, o: string) => s === DEFAULT_SORT && o === DEFAULT_ORDER;

  // Form state
  const [formQ, setFormQ] = useState(q);
  const [formSystem, setFormSystem] = useState(system);
  const [formSensorSize, setFormSensorSize] = useState(sensorSize);
  const [formType, setFormType] = useState(type);
  const [formModel, setFormModel] = useState(model);
  const [formFilmType, setFormFilmType] = useState(filmType);
  const [formSensorType, setFormSensorType] = useState(sensorType);
  const [formCropFactor, setFormCropFactor] = useState(cropFactor);
  const [formYear, setFormYear] = useState(year);
  const [formPriceMin, setFormPriceMin] = useState(priceMin);
  const [formPriceMax, setFormPriceMax] = useState(priceMax);

  // Sync form state when URL params change (back/forward navigation)
  useEffect(() => {
    setFormQ(q);
    setFormSystem(system);
    setFormSensorSize(sensorSize);
    setFormType(type);
    setFormModel(model);
    setFormFilmType(filmType);
    setFormSensorType(sensorType);
    setFormCropFactor(cropFactor);
    setFormYear(year);
    setFormPriceMin(priceMin);
    setFormPriceMax(priceMax);
  }, [q, system, sensorSize, type, model, filmType, sensorType, cropFactor, year, priceMin, priceMax]);

  // Reset list when initial data changes (filters applied via server component)
  useEffect(() => {
    listGenRef.current += 1;
    setItems(initialItems);
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor, initialTotal]);

  const buildApiUrl = useCallback(
    (cursor: number) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (system) params.set("system", system);
      if (sensorSize) params.set("sensorSize", sensorSize);
      if (type) params.set("type", type);
      if (model) params.set("model", model);
      if (filmType) params.set("filmType", filmType);
      if (sensorType) params.set("sensorType", sensorType);
      if (cropFactor) params.set("cropFactor", cropFactor);
      if (year) params.set("year", year);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (!isDefaultSort(sort, order)) {
        params.set("sort", sort);
        params.set("order", order);
      }
      params.set("cursor", String(cursor));
      return `/api/cameras?${params.toString()}`;
    },
    [q, system, sensorSize, type, model, filmType, sensorType, cropFactor, year, priceMin, priceMax, sort, order]
  );

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;
    const gen = listGenRef.current;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(nextCursor));
      const data = await res.json();
      if (gen !== listGenRef.current) return;
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
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

  function applyFilters(overrides: FilterOverrides = {}) {
    const params = new URLSearchParams();
    const qVal = overrides.q ?? formQ;
    const systemVal = overrides.system ?? formSystem;
    const sensorSizeVal = overrides.sensorSize ?? formSensorSize;
    const typeVal = overrides.type ?? formType;
    const modelVal = overrides.model ?? formModel;
    const filmTypeVal = overrides.filmType ?? formFilmType;
    const sensorTypeVal = overrides.sensorType ?? formSensorType;
    const cropFactorVal = overrides.cropFactor ?? formCropFactor;
    const yearVal = overrides.year ?? formYear;
    const priceMinVal = overrides.priceMin ?? formPriceMin;
    const priceMaxVal = overrides.priceMax ?? formPriceMax;
    const sortVal = overrides.sort ?? sort;
    const orderVal = overrides.order ?? order;
    if (qVal) params.set("q", qVal);
    if (systemVal) params.set("system", systemVal);
    if (sensorSizeVal) params.set("sensorSize", sensorSizeVal);
    if (typeVal) params.set("type", typeVal);
    if (modelVal) params.set("model", modelVal);
    if (filmTypeVal) params.set("filmType", filmTypeVal);
    if (sensorTypeVal) params.set("sensorType", sensorTypeVal);
    if (cropFactorVal) params.set("cropFactor", cropFactorVal);
    if (yearVal) params.set("year", yearVal);
    if (priceMinVal) params.set("priceMin", priceMinVal);
    if (priceMaxVal) params.set("priceMax", priceMaxVal);
    if (!isDefaultSort(sortVal, orderVal)) {
      params.set("sort", sortVal);
      params.set("order", orderVal);
    }
    const qs = params.toString();
    router.push(qs ? `/cameras?${qs}` : "/cameras");
  }

  function debouncedApply(overrides: FilterOverrides) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(overrides), 700);
  }

  function handleSort(column: string) {
    // A fresh click on Year starts newest-first to match the default view.
    const nextOrder = sort === column ? (order === "asc" ? "desc" : "asc") : column === "year" ? "desc" : "asc";
    trackEvent("camera_sort_change", { column, order: nextOrder });
    applyFilters({ sort: column, order: nextOrder });
  }

  function handleSearchChange(value: string) {
    setFormQ(value);
    debouncedApply({ q: value });
  }

  const clearAll: FilterOverrides = { q: "", system: "", sensorSize: "", type: "", model: "", filmType: "", sensorType: "", cropFactor: "", year: "", priceMin: "", priceMax: "" };

  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * Only what the closed panel is hiding. The chips below already report the
   * visible filters, so counting those here would say everything twice.
   */
  const hiddenFilterCount = [model, sensorType, cropFactor, year].filter(
    Boolean,
  ).length;

  const systemName =
    systemOptions.find((s) => s.slug === system)?.name ?? system;

  /**
   * Built from the URL rather than the form, so a filter arriving from a link
   * shows up here even when no control on the page can express it.
   */
  const chips: { key: string; label: string; value: string; clear: FilterOverrides }[] = [];
  if (q) chips.push({ key: "q", label: "Search", value: q, clear: { q: "" } });
  if (system) chips.push({ key: "system", label: "System", value: systemName, clear: { system: "" } });
  if (sensorSize) chips.push({ key: "sensorSize", label: "Sensor", value: sensorSize, clear: { sensorSize: "" } });
  if (type) chips.push({ key: "type", label: "Body", value: type, clear: { type: "" } });
  if (priceMin || priceMax) {
    chips.push({
      key: "price",
      label: "Price",
      value:
        priceMin && priceMax
          ? `$${priceMin}\u2013$${priceMax}`
          : priceMin
            ? `from $${priceMin}`
            : `up to $${priceMax}`,
      clear: { priceMin: "", priceMax: "" },
    });
  }
  // Each film type is an independent value in a comma list, so removing one
  // rewrites the list rather than clearing the filter.
  for (const f of filmTypeList) {
    chips.push({
      key: `film-${f}`,
      label: "Film",
      value: f,
      clear: { filmType: filmTypeList.filter((v) => v !== f).join(",") },
    });
  }
  if (model) chips.push({ key: "model", label: "Shutter", value: model, clear: { model: "" } });
  if (sensorType) chips.push({ key: "sensorType", label: "Sensor type", value: sensorType, clear: { sensorType: "" } });
  if (cropFactor) chips.push({ key: "cropFactor", label: "Crop", value: cropFactor, clear: { cropFactor: "" } });
  if (year) chips.push({ key: "year", label: "Year", value: year, clear: { year: "" } });

  return (
    <>
      {/* One wrapper so the bar reads as a group. Its own mt-4s were dead:
          the parent is space-y-8, which collapses with them to 32px, so the
          bar was spaced exactly like the gap to the results below it. */}
      <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="camera-search">Search cameras</label>
        <Input
          id="camera-search"
          type="text"
          placeholder="Search cameras..."
          value={formQ}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-11 flex-1 sm:h-10"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="camera-more-filters"
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor="camera-system" className="block text-xs font-medium text-muted-foreground">
            Mount
          </label>
          <select
            id="camera-system"
            value={formSystem}
            onChange={(e) => { setFormSystem(e.target.value); trackEvent("camera_filter_apply", { filter: "system", value: e.target.value }); applyFilters({ system: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All systems</option>
            {systemOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="camera-sensor-size" className="block text-xs font-medium text-muted-foreground">
            Sensor size
          </label>
          <select
            id="camera-sensor-size"
            value={formSensorSize}
            onChange={(e) => { setFormSensorSize(e.target.value); trackEvent("camera_filter_apply", { filter: "sensorSize", value: e.target.value }); applyFilters({ sensorSize: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All sensor sizes</option>
            {sensorSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="camera-type" className="block text-xs font-medium text-muted-foreground">
            Body type
          </label>
          <select
            id="camera-type"
            value={formType}
            onChange={(e) => { setFormType(e.target.value); trackEvent("camera_filter_apply", { filter: "type", value: e.target.value }); applyFilters({ type: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All body types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {/* A range is one thing, so it is one cell with one caption. */}
        <div className="space-y-1.5">
          <span id="camera-price-label" className="block text-xs font-medium text-muted-foreground">
            Price (USD)
          </span>
          <div className="flex items-center gap-1.5" role="group" aria-labelledby="camera-price-label">
            <Input
              id="camera-price-min"
              type="number"
              placeholder="Min"
              aria-label="Minimum price in USD"
              value={formPriceMin}
              onChange={(e) => { setFormPriceMin(e.target.value); debouncedApply({ priceMin: e.target.value }); }}
              className="h-10 w-full"
            />
            <span aria-hidden="true" className="shrink-0 text-muted-foreground">&ndash;</span>
            <Input
              id="camera-price-max"
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
        id="camera-more-filters"
        className={`${filtersOpen ? "grid" : "hidden"} grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4`}
      >
        <div className="space-y-1.5">
          <label htmlFor="camera-model" className="block text-xs font-medium text-muted-foreground">
            Shutter type
          </label>
          <select
            id="camera-model"
            value={formModel}
            onChange={(e) => { setFormModel(e.target.value); applyFilters({ model: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All shutter types</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="camera-sensor-type" className="block text-xs font-medium text-muted-foreground">
            Sensor type
          </label>
          <select
            id="camera-sensor-type"
            value={formSensorType}
            onChange={(e) => { setFormSensorType(e.target.value); trackEvent("camera_filter_apply", { filter: "sensorType", value: e.target.value }); applyFilters({ sensorType: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All sensor types</option>
            {sensorTypes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="camera-crop-factor" className="block text-xs font-medium text-muted-foreground">
            Crop factor
          </label>
          <select
            id="camera-crop-factor"
            value={formCropFactor}
            onChange={(e) => { setFormCropFactor(e.target.value); trackEvent("camera_filter_apply", { filter: "cropFactor", value: e.target.value }); applyFilters({ cropFactor: e.target.value }); }}
            className="filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All crop factors</option>
            {cropFactors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="camera-year" className="block text-xs font-medium text-muted-foreground">
            Year introduced
          </label>
          <Input
            id="camera-year"
            type="number"
            placeholder="e.g. 1996"
            value={formYear}
            onChange={(e) => { setFormYear(e.target.value); debouncedApply({ year: e.target.value }); }}
            className="h-10 w-full"
          />
        </div>
        {filmTypes.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <span id="camera-film-label" className="block text-xs font-medium text-muted-foreground">
              Film type
            </span>
            <div
              role="group"
              aria-labelledby="camera-film-label"
              className="flex flex-wrap gap-1.5"
            >
              {filmTypes.map((f) => {
                const active = filmTypeList.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const next = active
                        ? filmTypeList.filter((v) => v !== f)
                        : [...filmTypeList, f];
                      const value = next.join(",");
                      setFormFilmType(value);
                      trackEvent("camera_filter_apply", {
                        filter: "filmType",
                        value,
                      });
                      applyFilters({ filmType: value });
                    }}
                    className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:border-ring hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* What is applied, and the only way to take it off again. */}
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

      {/* Results */}
      {items.length > 0 ? (
        <>
        {/* A 975px table in a 358px viewport scrolled sideways and detached
            every value from its camera. Below xl the same rows are cards. */}
        <div className="hidden xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                { key: "name", label: "Name" },
                { key: "system", label: "System" },
                { key: "sensorSize", label: "Sensor Size", sortable: false },
                { key: "model", label: "Shutter", sortable: false },
                { key: "filmType", label: "Film Type", sortable: false },
                { key: "year", label: "Year" },
                { key: "price", label: "Avg Price" },
                { key: "weight", label: "Weight" },
              ].map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={col.sortable !== false ? "cursor-pointer select-none hover:text-foreground" : ""}
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
                      : <ChevronsUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/70" />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(({ camera, system: sys, avgPrice }) => {
              const specs = (camera.specs ?? {}) as Record<string, string>;
              return (
                <TableRow key={camera.id}>
                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <Link
                      href={`/cameras/${camera.slug}`}
                      className="block break-words leading-snug font-medium text-foreground hover:underline line-clamp-2"
                    >
                      {camera.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sys ? (
                      <button
                        type="button"
                        onClick={() => applyFilters({ ...clearAll, system: sys.slug })}
                        className="text-left hover:text-foreground hover:underline"
                      >
                        {sys.name}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {camera.sensorSize || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {specs["Model"] ? (
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = specs["Model"].startsWith("Electronically controlled")
                            ? "Electronically controlled"
                            : specs["Model"].startsWith("Mechanical")
                            ? "Mechanical"
                            : specs["Model"];
                          applyFilters({ ...clearAll, model: prefix });
                        }}
                        className="text-left hover:text-foreground hover:underline"
                      >
                        {specs["Model"]}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {specs["Film type"] ? (
                      <button
                        type="button"
                        onClick={() => applyFilters({ ...clearAll, filmType: specs["Film type"] })}
                        className="text-left hover:text-foreground hover:underline"
                      >
                        {specs["Film type"]}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {camera.yearIntroduced ? (
                      <button
                        type="button"
                        onClick={() => applyFilters({ ...clearAll, year: String(camera.yearIntroduced) })}
                        className="text-left hover:text-foreground hover:underline"
                      >
                        {camera.yearIntroduced}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {avgPrice != null
                      ? `$${avgPrice.toLocaleString()}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {camera.weightG ? `${camera.weightG}g` : "\u2014"}
                  </TableCell>
                </TableRow>
              );
            })}
            {loading && <TableSkeleton columns={8} rows={3} />}
          </TableBody>
        </Table>
        </div>

        <ul className="divide-y divide-border border-y border-border xl:hidden">
          {items.map(({ camera, system: sys, avgPrice }) => {
            const specs = (camera.specs ?? {}) as Record<string, string>;
            const specLine = [
              camera.sensorSize || specs["Maximum format"],
              camera.megapixels ? `${camera.megapixels} MP` : null,
              camera.bodyType,
              camera.weightG ? `${camera.weightG}g` : null,
              camera.yearIntroduced,
            ]
              .filter(Boolean)
              .join("\u00a0\u00b7 ");
            return (
              <li key={camera.id}>
                <Link
                  href={`/cameras/${camera.slug}`}
                  className="flex flex-col gap-1.5 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium leading-snug">{camera.name}</span>
                  {specLine && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {specLine}
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-3">
                    {sys ? (
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
                        {sys.name}
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

        {/* The skeleton lives inside the desktop wrapper, so without this the
            card list had no sign that more rows were on the way. */}
        {loading && (
          <p className="py-3 text-center text-sm text-muted-foreground xl:hidden">
            Loading more...
          </p>
        )}

        {/* Outside both layouts, so one observer serves the table and the
            cards. Inside the table it was inert wherever the table was
            hidden, which capped every phone at the first page. */}
        {nextCursor !== null && <div ref={sentinelRef} className="h-px w-full" />}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">
            No cameras found.
          </p>
        </div>
      )}

      <ScrollToTop />
    </>
  );
}
