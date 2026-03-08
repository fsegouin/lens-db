"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { lenses, systems } from "@/db/schema";

type LensRow = {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
};

type SystemOption = { name: string; slug: string };

type Props = {
  initialItems: LensRow[];
  initialTotal: number;
  initialNextCursor: number | null;
  brands: string[];
  systems: SystemOption[];
};

export default function LensList({
  initialItems,
  initialTotal,
  initialNextCursor,
  brands,
  systems: systemOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<LensRow[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [total, setTotal] = useState(initialTotal);
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
  const sort = searchParams.get("sort") || "";
  const order = searchParams.get("order") || "";

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
  }, [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year]);

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
      if (brand) params.set("brand", brand);
      if (system) params.set("system", system);
      if (type) params.set("type", type);
      if (minFocal) params.set("minFocal", minFocal);
      if (maxFocal) params.set("maxFocal", maxFocal);
      if (minAperture) params.set("minAperture", minAperture);
      if (maxAperture) params.set("maxAperture", maxAperture);
      if (year) params.set("year", year);
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      params.set("cursor", String(cursor));
      return `/api/lenses?${params.toString()}`;
    },
    [q, brand, system, type, minFocal, maxFocal, minAperture, maxAperture, year, sort, order]
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

  function applyFilters(overrides: { q?: string; brand?: string; system?: string; type?: string; minFocal?: string; maxFocal?: string; minAperture?: string; maxAperture?: string; year?: string; sort?: string; order?: string } = {}) {
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
    if (sortVal) params.set("sort", sortVal);
    if (orderVal) params.set("order", orderVal);
    const qs = params.toString();
    router.push(qs ? `/lenses?${qs}` : "/lenses");
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    applyFilters();
  }

  function handleSort(column: string) {
    if (sort === column) {
      applyFilters({ sort: column, order: order === "asc" ? "desc" : "asc" });
    } else {
      applyFilters({ sort: column, order: "asc" });
    }
  }

  function sortIndicator(column: string) {
    if (sort !== column) return "";
    return order === "desc" ? " \u2193" : " \u2191";
  }

  function handleSearchChange(value: string) {
    setFormQ(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: value }), 400);
  }

  return (
    <>
      {/* Filters */}
      <form className="flex flex-wrap gap-3" onSubmit={handleFilter}>
        <input
          type="text"
          placeholder="Search lenses..."
          value={formQ}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={formBrand}
          onChange={(e) => { setFormBrand(e.target.value); applyFilters({ brand: e.target.value }); }}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={formSystem}
          onChange={(e) => { setFormSystem(e.target.value); applyFilters({ system: e.target.value }); }}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All systems</option>
          {systemOptions.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={formType}
          onChange={(e) => { setFormType(e.target.value); applyFilters({ type: e.target.value }); }}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All types</option>
          <option value="prime">Prime</option>
          <option value="zoom">Zoom</option>
          <option value="macro">Macro</option>
        </select>
        <input
          type="number"
          placeholder="Min focal (mm)"
          value={formMinFocal}
          onChange={(e) => setFormMinFocal(e.target.value)}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          placeholder="Max focal (mm)"
          value={formMaxFocal}
          onChange={(e) => setFormMaxFocal(e.target.value)}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          step="0.1"
          placeholder="Min aperture"
          value={formMinAperture}
          onChange={(e) => setFormMinAperture(e.target.value)}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          step="0.1"
          placeholder="Max aperture"
          value={formMaxAperture}
          onChange={(e) => setFormMaxAperture(e.target.value)}
          className="w-36 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          placeholder="Year"
          value={formYear}
          onChange={(e) => setFormYear(e.target.value)}
          className="w-28 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

      {/* Results */}
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                {[
                  { key: "name", label: "Name" },
                  { key: "brand", label: "Brand" },
                  { key: "system", label: "System" },
                  { key: "focalLength", label: "Focal Length" },
                  { key: "aperture", label: "Aperture" },
                  { key: "type", label: "Type", sortable: false },
                  { key: "year", label: "Year" },
                  { key: "weight", label: "Weight" },
                  { key: "rating", label: "Rating" },
                ].map((col, i, arr) => (
                  <th
                    key={col.key}
                    className={`pb-3 font-medium ${i < arr.length - 1 ? "pr-4" : ""} ${col.sortable !== false ? "cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" : ""}`}
                    onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map(({ lens, system }) => (
                <tr
                  key={lens.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/lenses/${lens.slug}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {lens.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {lens.brand ? (
                      <button
                        onClick={() => applyFilters({ brand: lens.brand!, system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "" })}
                        className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {lens.brand}
                      </button>
                    ) : "\u2014"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {system ? (
                      <button
                        onClick={() => applyFilters({ system: system.slug, brand: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "" })}
                        className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {system.name}
                      </button>
                    ) : "\u2014"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {lens.focalLengthMin ? (
                      <button
                        onClick={() => applyFilters({ minFocal: String(lens.focalLengthMin), maxFocal: String(lens.focalLengthMax), brand: "", system: "", q: "", type: "", minAperture: "", maxAperture: "", year: "" })}
                        className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {lens.focalLengthMin === lens.focalLengthMax
                          ? `${lens.focalLengthMin}mm`
                          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`}
                      </button>
                    ) : "\u2014"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {lens.apertureMin ? (
                      <button
                        onClick={() => applyFilters({ minAperture: String(lens.apertureMin), maxAperture: String(lens.apertureMin), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", year: "" })}
                        className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        f/{lens.apertureMin}
                      </button>
                    ) : "\u2014"}
                  </td>
                  <td className="py-3 pr-4">
                    {lens.isZoom && (
                      <button
                        onClick={() => applyFilters({ type: "zoom", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "" })}
                        className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
                      >
                        Zoom
                      </button>
                    )}
                    {lens.isPrime && (
                      <button
                        onClick={() => applyFilters({ type: "prime", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "" })}
                        className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
                      >
                        Prime
                      </button>
                    )}
                    {lens.isMacro && (
                      <button
                        onClick={() => applyFilters({ type: "macro", brand: "", system: "", q: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "", year: "" })}
                        className="ml-1 rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800"
                      >
                        Macro
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {lens.yearIntroduced ? (
                      <button
                        onClick={() => applyFilters({ year: String(lens.yearIntroduced), brand: "", system: "", q: "", type: "", minFocal: "", maxFocal: "", minAperture: "", maxAperture: "" })}
                        className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                      >
                        {lens.yearIntroduced}
                      </button>
                    ) : "\u2014"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {lens.weightG ? `${lens.weightG}g` : "\u2014"}
                  </td>
                  <td className="py-3 text-zinc-600 dark:text-zinc-400">
                    {lens.averageRating != null ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {lens.averageRating.toFixed(1)}
                      </span>
                    ) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No lenses found. Run the scraper to populate the database.
          </p>
        </div>
      )}

      {/* Sentinel for infinite scroll + loading indicator */}
      {nextCursor !== null && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loading && (
            <p className="text-sm text-zinc-500">Loading more...</p>
          )}
        </div>
      )}
    </>
  );
}
