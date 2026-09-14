import { buildNameMatchers, matchesNormalizedName } from "./search.ts";
import type { HubCameraRow, HubLensRow } from "./hub-lists.ts";

/**
 * Filtering and sorting for the lens and camera tabs on a mount page.
 *
 * The page already holds every lens and body made for the mount, so this runs
 * in the browser: the page stays one static, cached render and no filter
 * change reaches the database. Each lens filter means exactly what the same
 * parameter means on /lenses (see listLenses), because the link to the full
 * filter bar carries the filters across and the list must not change on
 * arrival.
 */

export type MountTab = "lenses" | "cameras";

export const LENS_TYPES = ["prime", "zoom", "macro"] as const;
export type LensTypeFilter = (typeof LENS_TYPES)[number];

export type LensFilters = {
  q: string;
  type: LensTypeFilter | "";
  brand: string;
  minFocal: string;
  maxFocal: string;
  minAperture: string;
  maxAperture: string;
};

/** Search here matches the name only; /cameras also searches aliases. */
export type CameraFilters = { q: string; sensorSize: string };

export type SortOrder = "asc" | "desc";
export type Sort<K extends string> = { key: K; order: SortOrder };

export const LENS_SORT_KEYS = ["name", "brand", "focalLength", "aperture", "year"] as const;
export type LensSortKey = (typeof LENS_SORT_KEYS)[number];

export const CAMERA_SORT_KEYS = ["name", "sensorSize", "megapixels", "year"] as const;
export type CameraSortKey = (typeof CAMERA_SORT_KEYS)[number];

export const EMPTY_LENS_FILTERS: LensFilters = {
  q: "",
  type: "",
  brand: "",
  minFocal: "",
  maxFocal: "",
  minAperture: "",
  maxAperture: "",
};

export const EMPTY_CAMERA_FILTERS: CameraFilters = { q: "", sensorSize: "" };

/** The order hub-lists returns: lenses by family, cameras by name. */
export const CATALOGUE_ORDER = { key: "name", order: "asc" } as const;

const LENS_FILTER_KEYS = Object.keys(EMPTY_LENS_FILTERS) as (keyof LensFilters)[];
const CAMERA_FILTER_KEYS = Object.keys(EMPTY_CAMERA_FILTERS) as (keyof CameraFilters)[];

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function nameMatcher(q: string): (name: string) => boolean {
  const matchers = q.trim() ? buildNameMatchers(q) : [];
  if (matchers.length === 0) return () => true;
  return (name) => matchesNormalizedName(name, matchers);
}

export function matchesLensType(lens: HubLensRow, type: LensTypeFilter): boolean {
  if (type === "prime") return lens.isPrime === true;
  if (type === "zoom") return lens.isZoom === true;
  return lens.isMacro === true;
}

// A bound leaves out rows with no value, as the SQL comparison does.
const atLeast = (value: number | null, bound: number | null) =>
  bound == null || (value != null && value >= bound);
const atMost = (value: number | null, bound: number | null) =>
  bound == null || (value != null && value <= bound);

export function filterLenses(rows: HubLensRow[], f: LensFilters): HubLensRow[] {
  const nameMatches = nameMatcher(f.q);
  const minFocal = toNumber(f.minFocal);
  const maxFocal = toNumber(f.maxFocal);
  const minAperture = toNumber(f.minAperture);
  const maxAperture = toNumber(f.maxAperture);
  return rows.filter(
    (lens) =>
      nameMatches(lens.name) &&
      (!f.brand || lens.brand === f.brand) &&
      (!f.type || matchesLensType(lens, f.type)) &&
      // The whole range has to sit inside the bounds, as on /lenses.
      atLeast(lens.focalLengthMin, minFocal) &&
      atMost(lens.focalLengthMax, maxFocal) &&
      atLeast(lens.apertureMin, minAperture) &&
      atMost(lens.apertureMin, maxAperture),
  );
}

export function filterCameras(rows: HubCameraRow[], f: CameraFilters): HubCameraRow[] {
  const nameMatches = nameMatcher(f.q);
  return rows.filter(
    (camera) => nameMatches(camera.name) && (!f.sensorSize || camera.sensorSize === f.sensorSize),
  );
}

type SortValue = string | number | null;

/**
 * Rows arrive in catalogue order, which is what a name sort shows, so a name
 * sort only ever reverses it. Any other sort is stable, leaving ties in
 * catalogue order, and puts unknown values last in either direction.
 */
function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  value: (row: T, key: K) => SortValue,
): T[] {
  if (sort.key === "name") return sort.order === "asc" ? rows : [...rows].reverse();
  const direction = sort.order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const compared =
      typeof x === "string" && typeof y === "string"
        ? x.localeCompare(y, "en", { numeric: true, sensitivity: "base" })
        : Number(x) - Number(y);
    return compared * direction;
  });
}

export function sortLenses(rows: HubLensRow[], sort: Sort<LensSortKey>): HubLensRow[] {
  return sortRows(rows, sort, (lens, key) => {
    if (key === "brand") return lens.brand;
    if (key === "focalLength") return lens.focalLengthMin;
    if (key === "aperture") return lens.apertureMin;
    return lens.yearIntroduced;
  });
}

export function sortCameras(rows: HubCameraRow[], sort: Sort<CameraSortKey>): HubCameraRow[] {
  return sortRows(rows, sort, (camera, key) => {
    if (key === "sensorSize") return camera.sensorSize;
    if (key === "megapixels") return camera.megapixels;
    return camera.yearIntroduced;
  });
}

/** A second click flips the order; year starts newest first, as on /lenses. */
export function nextSort<K extends string>(current: Sort<K>, key: K): Sort<K> {
  if (current.key === key) return { key, order: current.order === "asc" ? "desc" : "asc" };
  return { key, order: key === "year" ? "desc" : "asc" };
}

export type FacetOption = { value: string; count: number };

/** The distinct values in one column with their counts, blanks left out. */
export function facetOptions(values: (string | null)[], order: "alpha" | "count"): FacetOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value?.trim()) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const byName = (a: FacetOption, b: FacetOption) =>
    a.value.localeCompare(b.value, "en", { numeric: true, sensitivity: "base" });
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort(order === "alpha" ? byName : (a, b) => b.count - a.count || byName(a, b));
}

export const hasLensFilters = (f: LensFilters) => LENS_FILTER_KEYS.some((k) => f[k].trim() !== "");
export const hasCameraFilters = (f: CameraFilters) =>
  CAMERA_FILTER_KEYS.some((k) => f[k].trim() !== "");

/** The URL holds the open tab and that tab's filters and sort, nothing else. */
export type MountView =
  | { tab: "lenses"; filters: LensFilters; sort: Sort<LensSortKey> }
  | { tab: "cameras"; filters: CameraFilters; sort: Sort<CameraSortKey> };

function readSort<K extends string>(params: URLSearchParams, keys: readonly K[]): Sort<K> {
  const key = params.get("sort");
  if (!key || !(keys as readonly string[]).includes(key)) return CATALOGUE_ORDER as Sort<K>;
  const order = params.get("order");
  return {
    key: key as K,
    order: order === "asc" || order === "desc" ? order : key === "year" ? "desc" : "asc",
  };
}

function readFilters<F extends Record<string, string>>(params: URLSearchParams, empty: F): F {
  const filters = { ...empty };
  for (const key of Object.keys(empty) as (keyof F & string)[]) {
    filters[key] = (params.get(key) ?? "") as F[typeof key];
  }
  return filters;
}

/** defaultTab is the tab a bare URL opens: cameras on a mount with no lenses. */
export function parseMountParams(params: URLSearchParams, defaultTab: MountTab = "lenses"): MountView {
  if ((params.get("tab") ?? defaultTab) === "cameras") {
    return {
      tab: "cameras",
      filters: readFilters(params, EMPTY_CAMERA_FILTERS),
      sort: readSort(params, CAMERA_SORT_KEYS),
    };
  }
  const filters = readFilters(params, EMPTY_LENS_FILTERS);
  if (!(LENS_TYPES as readonly string[]).includes(filters.type)) filters.type = "";
  return { tab: "lenses", filters, sort: readSort(params, LENS_SORT_KEYS) };
}

function setFilters(params: URLSearchParams, filters: Record<string, string>) {
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
}

export function mountParamsString(view: MountView, defaultTab: MountTab = "lenses"): string {
  const params = new URLSearchParams();
  if (view.tab !== defaultTab) params.set("tab", view.tab);
  setFilters(params, view.filters);
  if (view.sort.key !== CATALOGUE_ORDER.key || view.sort.order !== CATALOGUE_ORDER.order) {
    params.set("sort", view.sort.key);
    params.set("order", view.sort.order);
  }
  return params.toString();
}

/** The same lenses on /lenses, where the rest of the filters live. */
export function lensFinderHref(systemSlug: string, filters: LensFilters, sort: Sort<LensSortKey>): string {
  const params = new URLSearchParams({ system: systemSlug });
  setFilters(params, filters);
  // /lenses keeps its own default, newest first, out of the URL. Catalogue
  // order is left out too: /lenses has no family order, and its name sort is
  // plainly alphabetical, so asking for it would reorder the list anyway.
  const isDefault = sort.key === "year" && sort.order === "desc";
  const isCatalogue = sort.key === CATALOGUE_ORDER.key && sort.order === CATALOGUE_ORDER.order;
  if (!isDefault && !isCatalogue) {
    params.set("sort", sort.key);
    params.set("order", sort.order);
  }
  return `/lenses?${params}`;
}

export function cameraFinderHref(systemSlug: string, filters: CameraFilters): string {
  const params = new URLSearchParams({ system: systemSlug });
  setFilters(params, filters);
  return `/cameras?${params}`;
}
