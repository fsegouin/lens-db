"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { cameras, systems } from "@/db/schema";
import { Search } from "lucide-react";
import { ScrollToTop } from "@/components/scroll-to-top";
import { trackEvent } from "@/lib/analytics";
import { firstImageSrc } from "@/lib/image-utils";
import { MediaThumb } from "@/components/media-thumb";

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
  const sort = searchParams.get("sort") || "";
  const order = searchParams.get("order") || "";

  const [formQ, setFormQ] = useState(q);
  const [formYear, setFormYear] = useState(year);
  const [formPriceMin, setFormPriceMin] = useState(priceMin);
  const [formPriceMax, setFormPriceMax] = useState(priceMax);

  useEffect(() => {
    setFormQ(q);
    setFormYear(year);
    setFormPriceMin(priceMin);
    setFormPriceMax(priceMax);
  }, [q, year, priceMin, priceMax]);

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
    [q, system, sensorSize, type, model, filmType, sensorType, cropFactor, year, priceMin, priceMax, sort, order],
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

  function applyFilters(overrides: FilterOverrides = {}) {
    const params = new URLSearchParams();
    const qVal = overrides.q ?? formQ;
    const systemVal = overrides.system ?? system;
    const sensorSizeVal = overrides.sensorSize ?? sensorSize;
    const typeVal = overrides.type ?? type;
    const modelVal = overrides.model ?? model;
    const filmTypeVal = overrides.filmType ?? filmType;
    const sensorTypeVal = overrides.sensorType ?? sensorType;
    const cropFactorVal = overrides.cropFactor ?? cropFactor;
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

  function clearAll() {
    router.push("/cameras");
  }

  const anyFilterActive =
    !!q ||
    !!system ||
    !!sensorSize ||
    !!type ||
    !!model ||
    !!filmType ||
    !!sensorType ||
    !!cropFactor ||
    !!year ||
    !!priceMin ||
    !!priceMax;

  const SORT_OPTIONS = [
    { label: "Name", key: "name" },
    { label: "Year", key: "year" },
    { label: "Megapixels", key: "megapixels" },
    { label: "Weight", key: "weight" },
    { label: "Price", key: "price" },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      {/* Filters sidebar */}
      <aside className="lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-90px)] lg:overflow-y-auto lg:pr-2">
        <FilterGroup
          label="Mount system"
          clearable={!!system}
          onClear={() => applyFilters({ system: "" })}
        >
          <select
            value={system}
            onChange={(e) => {
              trackEvent("camera_filter_apply", { filter: "system", value: e.target.value });
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
          label="Sensor size"
          clearable={!!sensorSize}
          onClear={() => applyFilters({ sensorSize: "" })}
        >
          <select
            value={sensorSize}
            onChange={(e) => {
              trackEvent("camera_filter_apply", { filter: "sensorSize", value: e.target.value });
              applyFilters({ sensorSize: e.target.value });
            }}
            className={filterSelectClass(!!sensorSize)}
          >
            <option value="">Any sensor size</option>
            {sensorSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterGroup>

        {types.length > 0 && (
          <FilterGroup
            label="Type"
            clearable={!!type}
            onClear={() => applyFilters({ type: "" })}
          >
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => applyFilters({ type: active ? "" : t })}
                    className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
        )}

        {models.length > 0 && (
          <FilterGroup
            label="Shutter model"
            clearable={!!model}
            onClear={() => applyFilters({ model: "" })}
          >
            <select
              value={model}
              onChange={(e) => applyFilters({ model: e.target.value })}
              className={filterSelectClass(!!model)}
            >
              <option value="">All models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}

        {filmTypes.length > 0 && (
          <FilterGroup
            label="Film type"
            clearable={!!filmType}
            onClear={() => applyFilters({ filmType: "" })}
          >
            <div className="flex flex-wrap gap-1.5">
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
                      trackEvent("camera_filter_apply", { filter: "filmType", value });
                      applyFilters({ filmType: value });
                    }}
                    className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
        )}

        {sensorTypes.length > 0 && (
          <FilterGroup
            label="Sensor type"
            clearable={!!sensorType}
            onClear={() => applyFilters({ sensorType: "" })}
          >
            <select
              value={sensorType}
              onChange={(e) => applyFilters({ sensorType: e.target.value })}
              className={filterSelectClass(!!sensorType)}
            >
              <option value="">All sensors</option>
              {sensorTypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}

        {cropFactors.length > 0 && (
          <FilterGroup
            label="Crop factor"
            clearable={!!cropFactor}
            onClear={() => applyFilters({ cropFactor: "" })}
          >
            <select
              value={cropFactor}
              onChange={(e) => applyFilters({ cropFactor: e.target.value })}
              className={filterSelectClass(!!cropFactor)}
            >
              <option value="">Any crop factor</option>
              {cropFactors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}

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

      {/* Right: toolbar + card grid */}
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
              placeholder={`Filter within ${initialTotal.toLocaleString()} cameras…`}
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
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {items.map(({ camera, system: sys, avgPrice }) => {
              const specs = (camera.specs ?? {}) as Record<string, string>;
              const category = specs["Type"] ?? specs["Model"] ?? null;
              return (
                <Link
                  key={camera.id}
                  href={`/cameras/${camera.slug}`}
                  className="group flex flex-col bg-background p-5 transition-colors hover:bg-[var(--surface-soft)]"
                >
                  <MediaThumb
                    src={firstImageSrc(camera.images)}
                    alt={camera.name}
                    className="mb-3.5 aspect-[4/3] w-full rounded-md"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                  <div className="mono mb-2 truncate text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
                    {sys?.name ?? "—"}
                    {category && <> · {category}</>}
                  </div>
                  <div className="text-[16px] font-medium leading-[1.25] -tracking-[0.015em] group-hover:underline">
                    {camera.name}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2.5 border-t border-border pt-3">
                    <Spec label="MP" value={camera.megapixels != null ? `${camera.megapixels}` : null} />
                    <Spec label="Year" value={camera.yearIntroduced != null ? `${camera.yearIntroduced}` : null} />
                    <Spec
                      label={avgPrice != null ? "Price" : "Weight"}
                      value={
                        avgPrice != null
                          ? `$${avgPrice.toLocaleString()}`
                          : camera.weightG != null
                            ? `${Math.round(camera.weightG)}g`
                            : null
                      }
                    />
                  </div>
                </Link>
              );
            })}
            {nextCursor !== null && <div ref={sentinelRef} className="col-span-full h-px w-full" />}
          </div>
        ) : (
          <div className="mono rounded-[10px] border border-dashed border-border px-6 py-12 text-center text-[11px] text-[var(--fg-dim)]">
            No cameras match those filters.
          </div>
        )}

        <div className="mono mt-4 flex items-center justify-between px-1 text-[11px] text-[var(--fg-dim)]">
          <span>
            Showing <span className="text-foreground">{items.length.toLocaleString()}</span> of{" "}
            {initialTotal.toLocaleString()}
          </span>
          {loading && <span>Loading more…</span>}
        </div>

        <ScrollToTop />
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="mono mb-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        {label}
      </div>
      <div className="mono text-[12px] text-foreground">{value ?? "—"}</div>
    </div>
  );
}
