"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { HubCameraRow, HubLensRow } from "@/lib/hub-lists";
import { maxApertureLabel } from "@/lib/aperture";
import { trackEvent } from "@/lib/analytics";
import {
  CATALOGUE_ORDER,
  EMPTY_CAMERA_FILTERS,
  EMPTY_LENS_FILTERS,
  LENS_TYPES,
  cameraFinderHref,
  facetOptions,
  filterCameras,
  filterLenses,
  hasCameraFilters,
  hasLensFilters,
  lensFinderHref,
  matchesLensType,
  mountParamsString,
  nextSort,
  parseMountParams,
  sortCameras,
  sortLenses,
  type CameraFilters,
  type CameraSortKey,
  type FacetOption,
  type LensFilters,
  type LensSortKey,
  type LensTypeFilter,
  type MountTab,
  type Sort,
} from "@/lib/mount-catalogue";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const selectClass =
  "filter-select h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base text-foreground transition-colors outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const labelClass = "block text-xs font-medium text-muted-foreground";

const TAB_LABELS: Record<MountTab, string> = { lenses: "Lenses", cameras: "Cameras" };
const TYPE_LABELS: Record<LensTypeFilter, string> = { prime: "Prime", zoom: "Zoom", macro: "Macro" };

/** Below this many rows a list is short enough to read, so it gets no filters. */
const FILTER_MIN_ROWS = 10;

// The query string only changes after load through this component's own
// replaceState, so there is nothing to subscribe to. The server has none.
const subscribeToNothing = () => () => {};
const readSearch = () => window.location.search;
const readNoSearch = () => null;

type Props = {
  systemSlug: string;
  systemName: string;
  lenses: HubLensRow[];
  cameras: HubCameraRow[];
};

/**
 * The lens and camera tables on a mount page, as two tabs with a short filter
 * row each. The full filter bars stay on /lenses and /cameras, linked from
 * each tab with the current filters carried across.
 */
export default function MountCatalogue({ systemSlug, systemName, lenses, cameras }: Props) {
  const tabs = (["lenses", "cameras"] as const).filter(
    (t) => (t === "lenses" ? lenses : cameras).length > 0,
  );
  const [tab, setTab] = useState<MountTab>(tabs[0] ?? "lenses");
  const [lensFilters, setLensFilters] = useState<LensFilters>(EMPTY_LENS_FILTERS);
  const [lensSort, setLensSort] = useState<Sort<LensSortKey>>(CATALOGUE_ORDER);
  const [cameraFilters, setCameraFilters] = useState<CameraFilters>(EMPTY_CAMERA_FILTERS);
  const [cameraSort, setCameraSort] = useState<Sort<CameraSortKey>>(CATALOGUE_ORDER);

  const brandOptions = useMemo(() => facetOptions(lenses.map((l) => l.brand), "alpha"), [lenses]);
  const sensorOptions = useMemo(
    () => facetOptions(cameras.map((c) => c.sensorSize), "count"),
    [cameras],
  );
  const lensTypeOptions = useMemo(
    () => LENS_TYPES.filter((t) => lenses.some((lens) => matchesLensType(lens, t))),
    [lenses],
  );
  const defaultTab: MountTab = lenses.length > 0 ? "lenses" : "cameras";

  // The server renders the unfiltered catalogue, which keeps the page static
  // and cached. The query string is only readable in the browser, where it is
  // applied once, during render, so a filtered link paints filtered straight
  // after hydration. A filter with no control to show it is dropped: a
  // brand, size or lens type this mount does not have, or any filter on a
  // list too short to have filters.
  const search = useSyncExternalStore(subscribeToNothing, readSearch, readNoSearch);
  const [appliedSearch, setAppliedSearch] = useState<string | null>(null);
  if (search !== null && appliedSearch === null) {
    setAppliedSearch(search);
    const view = parseMountParams(new URLSearchParams(search), defaultTab);
    if (view.tab === "cameras" && cameras.length > 0) {
      const { sensorSize } = view.filters;
      setTab("cameras");
      if (cameras.length >= FILTER_MIN_ROWS) {
        setCameraFilters({
          ...view.filters,
          sensorSize: sensorOptions.some((o) => o.value === sensorSize) ? sensorSize : "",
        });
      }
      setCameraSort(view.sort);
    } else if (view.tab === "lenses" && lenses.length > 0) {
      const { brand, type } = view.filters;
      if (lenses.length >= FILTER_MIN_ROWS) {
        setLensFilters({
          ...view.filters,
          brand: brandOptions.some((o) => o.value === brand) ? brand : "",
          type: lensTypeOptions.length > 1 && lensTypeOptions.includes(type as LensTypeFilter) ? type : "",
        });
      }
      setLensSort(view.sort);
    }
  }

  // replaceState, not a navigation: a filter change is not a page to go back to.
  useEffect(() => {
    if (appliedSearch === null) return;
    const qs = mountParamsString(
      tab === "cameras"
        ? { tab, filters: cameraFilters, sort: cameraSort }
        : { tab, filters: lensFilters, sort: lensSort },
      defaultTab,
    );
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [appliedSearch, defaultTab, tab, lensFilters, lensSort, cameraFilters, cameraSort]);

  if (tabs.length === 0) return null;

  const hasTabs = tabs.length > 1;
  const counts: Record<MountTab, number> = { lenses: lenses.length, cameras: cameras.length };

  function selectTab(next: MountTab) {
    if (next === tab) return;
    setTab(next);
    trackEvent("mount_filter_apply", { filter: "tab", value: next, mount: systemSlug });
  }

  return (
    <section className="space-y-5">
      {hasTabs && (
        <div
          role="tablist"
          aria-label={`${systemName} lenses and cameras`}
          className="flex gap-6 border-b border-border"
        >
          {tabs.map((t, i) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`mount-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`mount-panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => selectTab(t)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                const index =
                  e.key === "Home" ? 0
                  : e.key === "End" ? tabs.length - 1
                  : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                selectTab(tabs[index]);
                document.getElementById(`mount-tab-${tabs[index]}`)?.focus();
              }}
              className={`-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-1 text-base font-semibold transition-colors ${
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
              <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                {counts[t].toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {tabs.map((t) => (
        <div
          key={t}
          id={`mount-panel-${t}`}
          role={hasTabs ? "tabpanel" : undefined}
          aria-labelledby={hasTabs ? `mount-tab-${t}` : undefined}
          hidden={t !== tab}
          className="space-y-4"
        >
          <h2
            className={
              hasTabs ? "sr-only" : "text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            }
          >
            {TAB_LABELS[t]} ({counts[t]})
          </h2>
          {t === "lenses" ? (
            <LensPanel
              systemSlug={systemSlug}
              systemName={systemName}
              lenses={lenses}
              brandOptions={brandOptions}
              typeOptions={lensTypeOptions}
              filters={lensFilters}
              onFiltersChange={setLensFilters}
              sort={lensSort}
              onSortChange={setLensSort}
            />
          ) : (
            <CameraPanel
              systemSlug={systemSlug}
              systemName={systemName}
              cameras={cameras}
              sensorOptions={sensorOptions}
              filters={cameraFilters}
              onFiltersChange={setCameraFilters}
              sort={cameraSort}
              onSortChange={setCameraSort}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function focalLengthLabel(lens: HubLensRow): string {
  if (!lens.focalLengthMin) return "\u2014";
  return lens.focalLengthMax && lens.focalLengthMax !== lens.focalLengthMin
    ? `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
    : `${lens.focalLengthMin}mm`;
}

function LensPanel({
  systemSlug,
  systemName,
  lenses,
  brandOptions,
  typeOptions,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: {
  systemSlug: string;
  systemName: string;
  lenses: HubLensRow[];
  brandOptions: FacetOption[];
  typeOptions: LensTypeFilter[];
  filters: LensFilters;
  onFiltersChange: (filters: LensFilters) => void;
  sort: Sort<LensSortKey>;
  onSortChange: (sort: Sort<LensSortKey>) => void;
}) {
  const { q, type, brand, minFocal, maxFocal, minAperture, maxAperture } = filters;
  // Typing re-renders up to 800 rows, so the table follows the search box
  // rather than holding it up.
  const deferredQ = useDeferredValue(q);
  const rows = useMemo(
    () =>
      sortLenses(
        filterLenses(lenses, { q: deferredQ, type, brand, minFocal, maxFocal, minAperture, maxAperture }),
        sort,
      ),
    [lenses, deferredQ, type, brand, minFocal, maxFocal, minAperture, maxAperture, sort],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<LensFilters>) => onFiltersChange({ ...filters, ...patch });
  const track = (filter: string, value: string) =>
    trackEvent("mount_filter_apply", { filter, value, mount: systemSlug });
  const trackText = (filter: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim()) track(filter, e.target.value.trim());
  };
  const filtered = hasLensFilters(filters);
  // The button pressed disappears once nothing is filtered, so focus is
  // handed to the search box instead of falling back to the page.
  const clear = () => {
    onFiltersChange(EMPTY_LENS_FILTERS);
    searchRef.current?.focus();
  };

  return (
    <>
      {lenses.length >= FILTER_MIN_ROWS && (
      <div className="space-y-4">
        <div>
          <label htmlFor="mount-lens-search" className="sr-only">
            Search {systemName} lenses
          </label>
          <Input
            ref={searchRef}
            id="mount-lens-search"
            type="search"
            placeholder={`Search ${lenses.length.toLocaleString()} lenses...`}
            value={q}
            onChange={(e) => update({ q: e.target.value })}
            onBlur={trackText("q")}
            className="h-11 sm:h-10"
          />
        </div>

        {/* On a phone the two ranges share a row, so the table starts
            within the first screen. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {typeOptions.length > 1 && (
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <span id="mount-lens-type-label" className={labelClass}>
                Type
              </span>
              <div
                role="group"
                aria-labelledby="mount-lens-type-label"
                className="flex h-11 gap-0.5 rounded-lg border border-input p-0.5 sm:h-10 dark:bg-input/30"
              >
                {(["", ...typeOptions] as const).map((t) => (
                  <button
                    key={t || "all"}
                    type="button"
                    aria-pressed={type === t}
                    onClick={() => {
                      update({ type: t });
                      if (t) track("type", t);
                    }}
                    className={`flex-1 rounded-md px-2 text-sm transition-colors ${
                      type === t
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t ? TYPE_LABELS[t] : "All"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {brandOptions.length > 1 && (
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <label htmlFor="mount-lens-brand" className={labelClass}>
                Brand
              </label>
              <select
                id="mount-lens-brand"
                value={brand}
                onChange={(e) => {
                  update({ brand: e.target.value });
                  if (e.target.value) track("brand", e.target.value);
                }}
                className={selectClass}
              >
                <option value="">All brands</option>
                {brandOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value} ({o.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <span id="mount-lens-focal-label" className={labelClass}>
              Focal length (mm)
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-labelledby="mount-lens-focal-label">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Min"
                aria-label="Minimum focal length in mm"
                value={minFocal}
                onChange={(e) => update({ minFocal: e.target.value })}
                onBlur={trackText("minFocal")}
                className="h-10 w-full"
              />
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                &ndash;
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Max"
                aria-label="Maximum focal length in mm"
                value={maxFocal}
                onChange={(e) => update({ maxFocal: e.target.value })}
                onBlur={trackText("maxFocal")}
                className="h-10 w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span id="mount-lens-aperture-label" className={labelClass}>
              Max aperture
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-labelledby="mount-lens-aperture-label">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="Min"
                aria-label="Widest maximum aperture"
                value={minAperture}
                onChange={(e) => update({ minAperture: e.target.value })}
                onBlur={trackText("minAperture")}
                className="h-10 w-full"
              />
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                &ndash;
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="Max"
                aria-label="Narrowest maximum aperture"
                value={maxAperture}
                onChange={(e) => update({ maxAperture: e.target.value })}
                onBlur={trackText("maxAperture")}
                className="h-10 w-full"
              />
            </div>
          </div>
        </div>

        <ResultLine
          shown={rows.length}
          total={lenses.length}
          nouns={["lens", "lenses"]}
          filtered={filtered}
          onClear={clear}
          moreHref={lensFinderHref(systemSlug, filters, sort)}
          moreLabel="Price, era and status filters on the Lenses page"
        />
      </div>
      )}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" sort={sort} onSort={onSortChange} onTrack={track} />
              <SortableHead label="Brand" sortKey="brand" sort={sort} onSort={onSortChange} onTrack={track} className="hidden sm:table-cell" />
              <SortableHead label="Focal length" sortKey="focalLength" sort={sort} onSort={onSortChange} onTrack={track} />
              <SortableHead label="Aperture" sortKey="aperture" sort={sort} onSort={onSortChange} onTrack={track} />
              <TableHead scope="col" className="hidden md:table-cell">
                Type
              </TableHead>
              <SortableHead label="Year" sortKey="year" sort={sort} onSort={onSortChange} onTrack={track} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lens) => (
              <TableRow key={lens.id}>
                <TableCell className="min-w-[10rem] whitespace-normal">
                  <Link
                    href={`/lenses/${lens.slug}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {lens.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {lens.brand || "\u2014"}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {focalLengthLabel(lens)}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {maxApertureLabel(lens.apertureMin, lens.apertureMax) ?? "\u2014"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {lens.isZoom && <Badge variant="zoom">Zoom</Badge>}
                    {lens.isPrime && <Badge variant="prime">Prime</Badge>}
                    {lens.isMacro && <Badge variant="macro">Macro</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {lens.yearIntroduced ?? "\u2014"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <NoMatches noun={`${systemName} lenses`} onClear={clear} />
      )}
    </>
  );
}

function CameraPanel({
  systemSlug,
  systemName,
  cameras,
  sensorOptions,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: {
  systemSlug: string;
  systemName: string;
  cameras: HubCameraRow[];
  sensorOptions: FacetOption[];
  filters: CameraFilters;
  onFiltersChange: (filters: CameraFilters) => void;
  sort: Sort<CameraSortKey>;
  onSortChange: (sort: Sort<CameraSortKey>) => void;
}) {
  const { q, sensorSize } = filters;
  const deferredQ = useDeferredValue(q);
  const rows = useMemo(
    () => sortCameras(filterCameras(cameras, { q: deferredQ, sensorSize }), sort),
    [cameras, deferredQ, sensorSize, sort],
  );

  const update = (patch: Partial<CameraFilters>) => onFiltersChange({ ...filters, ...patch });
  const track = (filter: string, value: string) =>
    trackEvent("mount_filter_apply", { filter: `camera_${filter}`, value, mount: systemSlug });
  const searchRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    onFiltersChange(EMPTY_CAMERA_FILTERS);
    searchRef.current?.focus();
  };

  return (
    <>
      {cameras.length >= FILTER_MIN_ROWS && (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <div className={sensorOptions.length > 1 ? "self-end" : "sm:col-span-2"}>
            <label htmlFor="mount-camera-search" className="sr-only">
              Search {systemName} cameras
            </label>
            <Input
              ref={searchRef}
              id="mount-camera-search"
              type="search"
              placeholder={`Search ${cameras.length.toLocaleString()} cameras...`}
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              onBlur={(e) => {
                if (e.target.value.trim()) track("q", e.target.value.trim());
              }}
              className="h-11 sm:h-10"
            />
          </div>
          {sensorOptions.length > 1 && (
            <div className="space-y-1.5">
              <label htmlFor="mount-camera-sensor" className={labelClass}>
                Sensor or film size
              </label>
              <select
                id="mount-camera-sensor"
                value={sensorSize}
                onChange={(e) => {
                  update({ sensorSize: e.target.value });
                  if (e.target.value) track("sensorSize", e.target.value);
                }}
                className={selectClass}
              >
                <option value="">All sizes</option>
                {sensorOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value} ({o.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <ResultLine
          shown={rows.length}
          total={cameras.length}
          nouns={["camera", "cameras"]}
          filtered={hasCameraFilters(filters)}
          onClear={clear}
          moreHref={cameraFinderHref(systemSlug, filters)}
          moreLabel="Body type, shutter and price filters on the Cameras page"
        />
      </div>
      )}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" sort={sort} onSort={onSortChange} onTrack={track} />
              <TableHead scope="col" className="hidden md:table-cell">
                Sensor type
              </TableHead>
              <SortableHead label="Sensor size" sortKey="sensorSize" sort={sort} onSort={onSortChange} onTrack={track} />
              <SortableHead label="Megapixels" sortKey="megapixels" sort={sort} onSort={onSortChange} onTrack={track} className="hidden sm:table-cell" />
              <SortableHead label="Year" sortKey="year" sort={sort} onSort={onSortChange} onTrack={track} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((camera) => (
              <TableRow key={camera.id}>
                <TableCell className="min-w-[10rem] whitespace-normal">
                  <Link
                    href={`/cameras/${camera.slug}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {camera.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {camera.sensorType || "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground">{camera.sensorSize || "\u2014"}</TableCell>
                <TableCell className="hidden font-mono tabular-nums text-muted-foreground sm:table-cell">
                  {camera.megapixels ? `${camera.megapixels} MP` : "\u2014"}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {camera.yearIntroduced ?? "\u2014"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <NoMatches noun={`${systemName} cameras`} onClear={clear} />
      )}
    </>
  );
}

function ResultLine({
  shown,
  total,
  nouns,
  filtered,
  onClear,
  moreHref,
  moreLabel,
}: {
  shown: number;
  total: number;
  nouns: [singular: string, plural: string];
  filtered: boolean;
  onClear: () => void;
  moreHref: string;
  moreLabel: string;
}) {
  const noun = total === 1 ? nouns[0] : nouns[1];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm">
      <p className="text-muted-foreground">
        <span aria-live="polite">
          {filtered ? (
            <>
              Showing <span className="font-mono tabular-nums text-foreground">{shown.toLocaleString()}</span> of{" "}
              {total.toLocaleString()} {noun}
            </>
          ) : (
            `${total.toLocaleString()} ${noun}`
          )}
        </span>
        {/* With nothing shown, the empty state carries the button. */}
        {filtered && shown > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-3 underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </p>
      <Link href={moreHref} className="underline underline-offset-2">
        {moreLabel} →
      </Link>
    </div>
  );
}

function NoMatches({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      No {noun} match these filters.{" "}
      <button
        type="button"
        onClick={onClear}
        className="underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Clear filters
      </button>
    </p>
  );
}

function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  onTrack,
  className,
}: {
  label: string;
  sortKey: K;
  sort: Sort<K>;
  onSort: (sort: Sort<K>) => void;
  onTrack: (filter: string, value: string) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead
      scope="col"
      className={className}
      aria-sort={active ? (sort.order === "desc" ? "descending" : "ascending") : undefined}
    >
      <button
        type="button"
        onClick={() => {
          const next = nextSort(sort, sortKey);
          onSort(next);
          onTrack("sort", `${next.key}:${next.order}`);
        }}
        className="-my-1.5 inline-flex items-center gap-1 py-1.5 transition-colors hover:text-foreground"
      >
        {label}
        {!active ? (
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        ) : sort.order === "desc" ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}
