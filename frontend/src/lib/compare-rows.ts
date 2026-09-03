import { formatMagnification } from "@/lib/format-magnification";

/**
 * The rows a comparison shows, and the types they read.
 *
 * Shared by the interactive tool and the static "X vs Y" pages so the two
 * cannot answer the same question differently. Values are plain strings; how
 * a cell is laid out is the caller's business.
 */

/**
 * What an unrecorded value reads as. A bare dash cannot be told apart from
 * "no", which matters most in exactly the rows a comparison turns on.
 */
export const EMPTY = "Not recorded";

export type ComparableLens = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  minFocusDistanceM: number | null;
  maxMagnification: number | null;
  lensElements: number | null;
  lensGroups: number | null;
  diaphragmBlades: number | null;
  yearIntroduced: number | null;
  isZoom: boolean | null;
  isMacro: boolean | null;
  isPrime: boolean | null;
  hasStabilization: boolean | null;
  hasAutofocus: boolean | null;
  lensType: string | null;
  era: string | null;
  productionStatus: string | null;
  specs: Record<string, string> | null;
};

export type ComparableCamera = {
  id: number;
  name: string;
  slug: string;
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
  resolution: string | null;
  yearIntroduced: number | null;
  bodyType: string | null;
  weightG: number | null;
  specs: Record<string, string> | null;
};

export type SpecRow<T> = { label: string; getValue: (item: T) => string };

export function focalLengthLabel(l: ComparableLens): string {
  if (!l.focalLengthMin) return EMPTY;
  return l.focalLengthMin === l.focalLengthMax
    ? `${l.focalLengthMin}mm`
    : `${l.focalLengthMin}-${l.focalLengthMax}mm`;
}

export const LENS_SPEC_ROWS: SpecRow<ComparableLens>[] = [
  { label: "Brand", getValue: (l) => l.brand || EMPTY },
  { label: "Type", getValue: (l) => l.lensType || EMPTY },
  { label: "Focal Length", getValue: focalLengthLabel },
  {
    label: "Max Aperture",
    getValue: (l) => (l.apertureMin ? `f/${l.apertureMin}` : EMPTY),
  },
  {
    label: "Min Aperture",
    getValue: (l) =>
      l.apertureMax && l.apertureMax !== l.apertureMin ? `f/${l.apertureMax}` : EMPTY,
  },
  { label: "Weight", getValue: (l) => (l.weightG ? `${l.weightG}g` : EMPTY) },
  { label: "Filter Size", getValue: (l) => (l.filterSizeMm ? `${l.filterSizeMm}mm` : EMPTY) },
  { label: "Lens Elements", getValue: (l) => l.lensElements?.toString() || EMPTY },
  { label: "Lens Groups", getValue: (l) => l.lensGroups?.toString() || EMPTY },
  { label: "Diaphragm Blades", getValue: (l) => l.diaphragmBlades?.toString() || EMPTY },
  {
    label: "Min Focus Distance",
    getValue: (l) => (l.minFocusDistanceM ? `${l.minFocusDistanceM}m` : EMPTY),
  },
  {
    label: "Max Magnification",
    getValue: (l) => formatMagnification(l.maxMagnification, EMPTY),
  },
  { label: "Autofocus", getValue: (l) => (l.hasAutofocus ? "Yes" : "No") },
  { label: "Stabilization", getValue: (l) => (l.hasStabilization ? "Yes" : "No") },
  { label: "Year Introduced", getValue: (l) => l.yearIntroduced?.toString() || EMPTY },
  { label: "Status", getValue: (l) => l.productionStatus || EMPTY },
  { label: "Era", getValue: (l) => l.era || EMPTY },
  {
    label: "Lens Hood",
    getValue: (l) => (l.specs as Record<string, string>)?.["Lens hood"] || EMPTY,
  },
];

export function cameraSpec(c: ComparableCamera, ...keys: string[]): string {
  const specs = (c.specs || {}) as Record<string, string>;
  for (const k of keys) {
    if (specs[k]) return specs[k];
  }
  return EMPTY;
}

export const CAMERA_SPEC_ROWS: SpecRow<ComparableCamera>[] = [
  { label: "Type", getValue: (c) => cameraSpec(c, "Type") },
  { label: "Model", getValue: (c) => cameraSpec(c, "Model") },
  { label: "Film Type", getValue: (c) => cameraSpec(c, "Film type") },
  { label: "Imaging Sensor", getValue: (c) => cameraSpec(c, "Imaging sensor", "Imaging plane") },
  { label: "Sensor Size", getValue: (c) => c.sensorSize || cameraSpec(c, "Maximum format") },
  { label: "Megapixels", getValue: (c) => (c.megapixels ? `${c.megapixels} MP` : EMPTY) },
  { label: "Resolution", getValue: (c) => c.resolution || EMPTY },
  { label: "Crop Factor", getValue: (c) => cameraSpec(c, "Crop factor") },
  {
    label: "Image Stabilization",
    getValue: (c) => cameraSpec(c, "Sensor-shift image stabilization"),
  },
  { label: "Speeds", getValue: (c) => cameraSpec(c, "Speeds") },
  { label: "Exposure Modes", getValue: (c) => cameraSpec(c, "Exposure modes") },
  { label: "Exposure Metering", getValue: (c) => cameraSpec(c, "Exposure metering") },
  { label: "Dimensions", getValue: (c) => cameraSpec(c, "Dimensions") },
  { label: "Year Introduced", getValue: (c) => c.yearIntroduced?.toString() || EMPTY },
  { label: "Weight", getValue: (c) => (c.weightG ? `${c.weightG}g` : EMPTY) },
  { label: "Body Type", getValue: (c) => c.bodyType || EMPTY },
];
