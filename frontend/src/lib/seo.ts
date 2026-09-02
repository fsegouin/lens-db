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

/**
 * "an 85mm", "a 50mm", "an APS-C", "a 35mm". The article follows how the
 * phrase is spoken, not how it is spelled, so an acronym is judged by the
 * sound of its first letter: "an SLR" (ess), but "a CMOS" (see).
 */
const VOWEL_SOUND_LETTERS = new Set(["A", "E", "F", "H", "I", "L", "M", "N", "O", "R", "S", "X"]);

function indefiniteArticle(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? "";
  if (!first) return "a";

  // Numbers are spoken: eight, eleven, eighteen all begin with a vowel.
  if (/^\d/.test(first)) return /^(8|11|18)/.test(first) ? "an" : "a";

  // An acronym is read letter by letter.
  if (/^[A-Z]{2,}/.test(first)) {
    return VOWEL_SOUND_LETTERS.has(first[0]) ? "an" : "a";
  }

  return /^[aeiou]/i.test(first) ? "an" : "a";
}

/**
 * Body types are stored capitalised ("SLR-style mirrorless", "Compact SLR").
 * Lowercasing the whole string mid-sentence flattened the acronyms into
 * "slr-style"; only the first word is lowered, and only when it is not itself
 * an acronym.
 */
function lowerFirstWord(value: string): string {
  const [first] = value.split(/\s+/);
  if (!first || /^[A-Z]{2,}/.test(first)) return value;
  return value[0].toLowerCase() + value.slice(1);
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
export function lensDescription(lens: LensLike, systemNames: string[]): string {
  return clamp(
    `${lensLead(lens, systemNames)} Full specifications, used price history and compatible cameras.`,
  );
}

/**
 * The on-page version: the same facts, but never truncated and without the
 * "full specifications" tail, which is search-result copy rather than prose.
 */
export function lensLead(lens: LensLike, systemNames: string[]): string {
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

  return `${lead}.${facts ? ` ${facts}.` : ""}`;
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
  return clamp(
    `${cameraLead(camera, systemName)} Full specifications, used price history and the lenses that fit it.`,
  );
}

/** The on-page version: no truncation, no search-result tail. */
export function cameraLead(camera: CameraLike, systemName: string | null): string {
  const descriptor = sentence(
    [
      camera.sensorSize,
      camera.megapixels ? `${camera.megapixels} MP` : null,
      camera.bodyType ? lowerFirstWord(camera.bodyType) : "camera",
    ],
    " ",
  );

  const lead = sentence(
    [
      `${camera.name} is ${indefiniteArticle(descriptor)}`,
      descriptor,
      systemName ? `with a ${systemName} mount` : null,
      camera.yearIntroduced ? `introduced in ${camera.yearIntroduced}` : null,
    ],
    " ",
  );

  return `${lead}.`;
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
