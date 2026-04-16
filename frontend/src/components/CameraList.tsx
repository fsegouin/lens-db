"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { cameras, systems } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableSkeleton } from "@/components/table-skeleton";
import { ScrollToTop } from "@/components/scroll-to-top";

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
  const [, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Current filter values from URL
  const q = searchParams.get("q") || "";
  const system = searchParams.get("system") || "";
  const sensorSize = searchParams.get("sensorSize") || "";
  const type = searchParams.get("type") || "";
  const model = searchParams.get("model") || "";
  const filmType = searchParams.get("filmType") || "";
  const sensorType = searchParams.get("sensorType") || "";
  const cropFactor = searchParams.get("cropFactor") || "";
  const year = searchParams.get("year") || "";
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";
  const sort = searchParams.get("sort") || "";
  const order = searchParams.get("order") || "";

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
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setTotal(initialTotal);
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
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      params.set("cursor", String(cursor));
      return `/api/cameras?${params.toString()}`;
    },
    [q, system, sensorSize, type, model, filmType, sensorType, cropFactor, year, priceMin, priceMax, sort, order]
  );

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(nextCursor));
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
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
    if (sortVal) params.set("sort", sortVal);
    if (orderVal) params.set("order", orderVal);
    const qs = params.toString();
    router.push(qs ? `/cameras?${qs}` : "/cameras");
  }

  function debouncedApply(overrides: FilterOverrides) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(overrides), 700);
  }

  function handleSort(column: string) {
    if (sort === column) {
      applyFilters({ sort: column, order: order === "asc" ? "desc" : "asc" });
    } else {
      applyFilters({ sort: column, order: "asc" });
    }
  }

  function handleSearchChange(value: string) {
    setFormQ(value);
    debouncedApply({ q: value });
  }

  const clearAll: FilterOverrides = { q: "", system: "", sensorSize: "", type: "", model: "", filmType: "", sensorType: "", cropFactor: "", year: "", priceMin: "", priceMax: "" };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="sr-only" htmlFor="camera-search">Search cameras</label>
          <Input
            id="camera-search"
            type="text"
            placeholder="Search cameras..."
            value={formQ}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-system">System</label>
          <select
            id="camera-system"
            value={formSystem}
            onChange={(e) => { setFormSystem(e.target.value); applyFilters({ system: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All systems</option>
            {systemOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-sensor-size">Sensor size</label>
          <select
            id="camera-sensor-size"
            value={formSensorSize}
            onChange={(e) => { setFormSensorSize(e.target.value); applyFilters({ sensorSize: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All sensor sizes</option>
            {sensorSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-type">Type</label>
          <select
            id="camera-type"
            value={formType}
            onChange={(e) => { setFormType(e.target.value); applyFilters({ type: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-model">Model</label>
          <select
            id="camera-model"
            value={formModel}
            onChange={(e) => { setFormModel(e.target.value); applyFilters({ model: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All models</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-film-type">Film type</label>
          <select
            id="camera-film-type"
            value={formFilmType}
            onChange={(e) => { setFormFilmType(e.target.value); applyFilters({ filmType: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All film types</option>
            {filmTypes.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-sensor-type">Sensor type</label>
          <select
            id="camera-sensor-type"
            value={formSensorType}
            onChange={(e) => { setFormSensorType(e.target.value); applyFilters({ sensorType: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All sensors</option>
            {sensorTypes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-crop-factor">Crop factor</label>
          <select
            id="camera-crop-factor"
            value={formCropFactor}
            onChange={(e) => { setFormCropFactor(e.target.value); applyFilters({ cropFactor: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All crop factors</option>
            {cropFactors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-year">Year</label>
          <Input
            id="camera-year"
            type="number"
            placeholder="Year"
            value={formYear}
            onChange={(e) => { setFormYear(e.target.value); debouncedApply({ year: e.target.value }); }}
            className="h-10 w-28"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-price-min">Min price</label>
          <Input
            id="camera-price-min"
            type="number"
            placeholder="Min $"
            value={formPriceMin}
            onChange={(e) => { setFormPriceMin(e.target.value); debouncedApply({ priceMin: e.target.value }); }}
            className="h-10 w-24"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="camera-price-max">Max price</label>
          <Input
            id="camera-price-max"
            type="number"
            placeholder="Max $"
            value={formPriceMax}
            onChange={(e) => { setFormPriceMax(e.target.value); debouncedApply({ priceMax: e.target.value }); }}
            className="h-10 w-24"
          />
        </div>
      </div>

      {/* Results */}
      {items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              {[
                { key: "name", label: "Name" },
                { key: "system", label: "System" },
                { key: "sensorSize", label: "Sensor Size", sortable: false },
                { key: "model", label: "Model", sortable: false },
                { key: "filmType", label: "Film Type", sortable: false },
                { key: "year", label: "Year" },
                { key: "price", label: "Avg Price" },
                { key: "weight", label: "Weight" },
              ].map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={col.sortable !== false ? "cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" : ""}
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
            {items.map(({ camera, system: sys, avgPrice }) => {
              const specs = (camera.specs ?? {}) as Record<string, string>;
              return (
                <TableRow key={camera.id}>
                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <Link
                      href={`/cameras/${camera.slug}`}
                      className="block break-words leading-snug font-medium text-zinc-900 hover:underline line-clamp-2 dark:text-zinc-100"
                    >
                      {camera.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {sys ? (
                      <button
                        onClick={() => applyFilters({ ...clearAll, system: sys.slug })}
                        className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {sys.name}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {camera.sensorSize || "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {specs["Model"] ? (
                      <button
                        onClick={() => {
                          const prefix = specs["Model"].startsWith("Electronically controlled")
                            ? "Electronically controlled"
                            : specs["Model"].startsWith("Mechanical")
                            ? "Mechanical"
                            : specs["Model"];
                          applyFilters({ ...clearAll, model: prefix });
                        }}
                        className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {specs["Model"]}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {specs["Film type"] ? (
                      <button
                        onClick={() => applyFilters({ ...clearAll, filmType: specs["Film type"] })}
                        className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {specs["Film type"]}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {camera.yearIntroduced ? (
                      <button
                        onClick={() => applyFilters({ ...clearAll, year: String(camera.yearIntroduced) })}
                        className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {camera.yearIntroduced}
                      </button>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {avgPrice != null
                      ? `$${avgPrice.toLocaleString()}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {camera.weightG ? `${camera.weightG}g` : "\u2014"}
                  </TableCell>
                </TableRow>
              );
            })}
            {loading && <TableSkeleton columns={8} rows={3} />}
            {nextCursor !== null && (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <div ref={sentinelRef} className="h-px w-full" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No cameras found.
          </p>
        </div>
      )}

      <ScrollToTop />
    </>
  );
}
