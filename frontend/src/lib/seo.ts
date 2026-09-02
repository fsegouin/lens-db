import type { Metadata } from "next";

export const SITE_URL = "https://thelensdb.com";
export const SITE_NAME = "The Lens DB";

/** "50mm" for a prime, "24-70mm" for a zoom, null when unknown. */
export function formatFocalLength(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null) return null;
  return max != null && max !== min ? `${min}-${max}mm` : `${min}mm`;
}

function sentence(parts: (string | null | undefined)[], join = ", "): string {
  return parts.filter(Boolean).join(join);
}

/** Clamp to a length search engines will actually render. */
function clamp(text: string, max = 158): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "an 85mm", "a 50mm" — spoken form, so the leading digit decides. */
function indefiniteArticle(value: string): string {
  return /^(8|11|18)/.test(value) ? "an" : "a";
}

/**
 * A lens cannot have more groups than elements, but the imported data
 * sometimes says so. Suppress the claim rather than publish it in a meta
 * description and in structured data.
 */
export function opticalConstruction(
  elements: number | null | undefined,
  groups: number | null | undefined,
): string | null {
  if (!elements || !groups || groups > elements) return null;
  return `${elements} elements in ${groups} groups`;
}

type LensLike = {
  name: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  isPrime: boolean | null;
  isZoom: boolean | null;
  yearIntroduced: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  lensElements: number | null;
  lensGroups: number | null;
};

/**
 * A factual one-liner built from the columns we trust. Written so the first
 * clause reads as a definition — the shape an answer engine can quote.
 */
export function lensDescription(
  lens: LensLike,
  systemNames: string[],
): string {
  const focal = formatFocalLength(lens.focalLengthMin, lens.focalLengthMax);
  const aperture = lens.apertureMin ? `f/${lens.apertureMin}` : null;
  const kind = lens.isZoom ? "zoom lens" : lens.isPrime ? "prime lens" : "lens";
  const mounts = systemNames.length > 0 ? `for ${systemNames.join(", ")}` : null;

  const summary = sentence([focal, aperture], " ");
  const lead = sentence(
    [
      `${lens.name} is ${summary ? indefiniteArticle(summary) : "a"}`,
      summary,
      kind,
      mounts,
      lens.yearIntroduced ? `introduced in ${lens.yearIntroduced}` : null,
    ],
    " ",
  );

  const facts = sentence([
    lens.weightG ? `${lens.weightG} g` : null,
    lens.filterSizeMm ? `${lens.filterSizeMm} mm filter` : null,
    opticalConstruction(lens.lensElements, lens.lensGroups),
  ]);

  return clamp(
    `${lead}.${facts ? ` ${facts}.` : ""} Full specifications, used price history and compatible cameras.`,
  );
}

type CameraLike = {
  name: string;
  sensorSize: string | null;
  sensorType: string | null;
  megapixels: number | null;
  bodyType: string | null;
  yearIntroduced: number | null;
};

export function cameraDescription(
  camera: CameraLike,
  systemName: string | null,
): string {
  const lead = sentence(
    [
      `${camera.name} is a`,
      camera.sensorSize,
      camera.megapixels ? `${camera.megapixels} MP` : null,
      camera.bodyType?.toLowerCase() ?? "camera",
      systemName ? `with a ${systemName} mount` : null,
      camera.yearIntroduced ? `introduced in ${camera.yearIntroduced}` : null,
    ],
    " ",
  );

  return clamp(
    `${lead}. Full specifications, used price history and the lenses that fit it.`,
  );
}

type EntityMetadataInput = {
  title: string;
  description: string;
  path: string;
  images?: string[];
};

/**
 * Title/description/canonical/OG in one place so every entity route emits the
 * same shape. The root layout supplies the "| The Lens DB" suffix.
 */
export function entityMetadata({
  title,
  description,
  path,
  images,
}: EntityMetadataInput): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: SITE_NAME,
      ...(images?.length ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images?.length ? { images } : {}),
    },
  };
}
