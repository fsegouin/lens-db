"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { lenses, systems } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableSkeleton } from "@/components/table-skeleton";
import { ScrollToTop } from "@/components/scroll-to-top";

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
  const sort = searchParams.get("sort") || "";
  const order = searchParams.get("order") || "";
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
    [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year, lensType, era, productionStatus, coverage, series, sort, order, priceMin, priceMax]
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
    const qs = params.toString();
    router.push(qs ? `/lenses?${qs}` : "/lenses");
  }

  function debouncedApply(overrides: Parameters<typeof applyFilters>[0]) {
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

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="sr-only" htmlFor="lens-search">Search lenses</label>
          <Input
            id="lens-search"
            type="text"
            placeholder="Search lenses..."
            value={formQ}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-brand">Brand</label>
          <select
            id="lens-brand"
            value={formBrand}
            onChange={(e) => { setFormBrand(e.target.value); applyFilters({ brand: e.target.value }); }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-system">System</label>
          <select
            id="lens-system"
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
          <label className="sr-only" htmlFor="lens-type">Type</label>
          <select
            id="lens-type"
            value={lensType === "teleconverter" ? "teleconverter" : formType}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "teleconverter") {
                setFormType("");
                applyFilters({ type: "", lensType: "teleconverter" });
              } else {
                setFormType(val);
                applyFilters({ type: val, lensType: "" });
              }
            }}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All types</option>
            <option value="prime">Prime</option>
            <option value="zoom">Zoom</option>
            <option value="macro">Macro</option>
            <option value="teleconverter">Teleconverter</option>
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-series">Series</label>
          <select
            id="lens-series"
            value={series}
            onChange={(e) => applyFilters({ series: e.target.value })}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All series</option>
            {seriesOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-coverage">Coverage</label>
          <select
            id="lens-coverage"
            value={coverage}
            onChange={(e) => applyFilters({ coverage: e.target.value })}
            className="filter-select h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All coverage</option>
            <option value="full-frame">Full Frame</option>
            <option value="aps-c">APS-C</option>
            <option value="micro-four-thirds">Micro Four Thirds</option>
            <option value="medium-format">Medium Format</option>
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-min-focal">Min focal length</label>
          <Input
            id="lens-min-focal"
            type="number"
            placeholder="From (mm)"
            value={formMinFocal}
            onChange={(e) => { setFormMinFocal(e.target.value); debouncedApply({ minFocal: e.target.value }); }}
            className="h-10 w-36"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-max-focal">Max focal length</label>
          <Input
            id="lens-max-focal"
            type="number"
            placeholder="To (mm)"
            value={formMaxFocal}
            onChange={(e) => { setFormMaxFocal(e.target.value); debouncedApply({ maxFocal: e.target.value }); }}
            className="h-10 w-36"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-min-aperture">Min aperture</label>
          <Input
            id="lens-min-aperture"
            type="number"
            step="0.1"
            placeholder="Min aperture"
            value={formMinAperture}
            onChange={(e) => { setFormMinAperture(e.target.value); debouncedApply({ minAperture: e.target.value }); }}
            className="h-10 w-36"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-max-aperture">Max aperture</label>
          <Input
            id="lens-max-aperture"
            type="number"
            step="0.1"
            placeholder="Max aperture"
            value={formMaxAperture}
            onChange={(e) => { setFormMaxAperture(e.target.value); debouncedApply({ maxAperture: e.target.value }); }}
            className="h-10 w-36"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="lens-year">Year</label>
          <Input
            id="lens-year"
            type="number"
            placeholder="Year"
            value={formYear}
            onChange={(e) => { setFormYear(e.target.value); debouncedApply({ year: e.target.value }); }}
            className="h-10 w-28"
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
                { key: "brand", label: "Brand" },
                { key: "system", label: "System" },
                { key: "focalLength", label: "Focal Length" },
                { key: "aperture", label: "Aperture" },
                { key: "type", label: "Type", sortable: false, className: "w-20" },
                { key: "series", label: "Series", sortable: false },
                { key: "year", label: "Year" },
                { key: "weight", label: "Weight" },
                { key: "rating", label: "Rating" },
              ].map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={`${col.sortable !== false ? "cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" : ""} ${"className" in col ? col.className : ""}`}
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
            {items.map(({ lens, system, series: lensSeries }) => (
              <TableRow key={lens.id}>
                <TableCell className="max-w-[22rem] whitespace-normal">
                  <Link
                    href={`/lenses/${lens.slug}`}
                    className="block break-words leading-snug font-medium text-zinc-900 hover:underline line-clamp-2 dark:text-zinc-100"
                  >
                    {lens.name}
                  </Link>
                </TableCell>
                <TableCell className="text-zinc-500">
                  {lens.brand ? (
                    <button
                      onClick={() => applyFilters({ brand: lens.brand!, system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                      className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {lens.brand}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-zinc-500">
                  {system ? (
                    <button
                      onClick={() => applyFilters({ system: system.slug, brand: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                      className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {system.name}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-zinc-600 dark:text-zinc-400">
                  {lens.focalLengthMin ? (
                    <button
                      onClick={() => applyFilters({ minFocal: String(lens.focalLengthMin), maxFocal: String(lens.focalLengthMax), brand: "", system: "", q: "", type: "", minAperture: "", maxAperture: "", year: "", lensType: "", era: "", productionStatus: "", coverage: "" })}
                      className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {lens.focalLengthMin === lens.focalLengthMax
                        ? `${lens.focalLengthMin}mm`
                        : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-zinc-600 dark:text-zinc-400">
                  {lens.apertureMin ? (
                    <button
                      onClick={() => applyFilters({ minAperture: String(lens.apertureMin), maxAperture: String(lens.apertureMin), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", year: "", coverage: "" })}
                      className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
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
                  {lens.lensType === "teleconverter" && (
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
                <TableCell className="text-zinc-600 dark:text-zinc-400">
                  {lens.yearIntroduced ? (
                    <button
                      onClick={() => applyFilters({ year: String(lens.yearIntroduced), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", coverage: "" })}
                      className="text-left hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {lens.yearIntroduced}
                    </button>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-zinc-600 dark:text-zinc-400">
                  {lens.weightG ? `${lens.weightG}g` : "\u2014"}
                </TableCell>
                <TableCell className="text-zinc-600 dark:text-zinc-400">
                  {lens.averageRating != null ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {lens.averageRating.toFixed(1)}
                    </span>
                  ) : "\u2014"}
                </TableCell>
              </TableRow>
            ))}
            {loading && <TableSkeleton columns={10} rows={3} />}
            {nextCursor !== null && (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <div ref={sentinelRef} className="h-px w-full" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No lenses found.
          </p>
        </div>
      )}

      <ScrollToTop />
    </>
  );
}
