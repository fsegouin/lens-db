/**
 * Shared logic for the camera-body half of the DPReview watcher.
 *
 * The lens half lives in dpreview-import.ts. This module is its counterpart:
 * same shape, different column mapping and duplicate heuristics, because a
 * body is identified by sensor and model line rather than focal length and
 * aperture.
 *
 * Every label and value below was read off live DPReview product pages, and
 * every target vocabulary off the live database, rather than guessed.
 */

import { extractBrand, generateSlug, parseWeight } from "@/lib/dpreview-import";

export interface DpreviewCameraCandidate {
  dpreviewSlug: string;
  dpreviewUrl: string;
  name: string;
  specTable: Record<string, string>;
  imageUrls: string[];
  year?: number;
  price?: string;
}

/**
 * Camera slugs carry the announcement year, unlike lens slugs:
 * "nikon-z5ii-2025", "canon-eos-r6-mark-iii-2025". The convention is load
 * bearing — bodies are re-released under recycled names far more often than
 * lenses are, and cameras.slug is unique (migration 0049).
 */
export function cameraSlug(name: string, year: number | null | undefined): string {
  const base = generateSlug(name);
  return year ? `${base}-${year}` : base;
}

function parseFloatOrNull(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.replace(/,(?=\d{3})/g, "").match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * "24 megapixels" → 24, "25.74 megapixels" → 25.74.
 *
 * Kept verbatim rather than rounded: DPReview reports whole numbers for most
 * bodies and a precise figure for some, and megapixels is a real column.
 */
export function parseMegapixels(str: string | null | undefined): number | null {
  return parseFloatOrNull(str);
}

/**
 * "6048 × 4032 px" → "6048 x 4032 - 24 MP".
 *
 * The target format is the one already in the database (ASCII "x", megapixel
 * suffix), so watcher rows read identically to their neighbours.
 */
export function mapResolution(
  raw: string | null | undefined,
  megapixels: number | null,
): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{3,6})\s*[×x]\s*(\d{3,6})/i);
  if (!m) return null;
  const base = `${m[1]} x ${m[2]}`;
  return megapixels !== null ? `${base} - ${Math.round(megapixels)} MP` : base;
}

// Format names as the database actually spells them, widest first. DPReview
// publishes physical dimensions ("35.9 × 23.9 mm") while cameras.sensor_size
// is an exact-match browse filter over format names, so an unmapped raw
// dimension string would create a junk facet entry for a single body.
const SENSOR_BANDS: { minWidthMm: number; maxWidthMm: number; name: string }[] = [
  { minWidthMm: 46, maxWidthMm: 70, name: "Medium format" },
  { minWidthMm: 40, maxWidthMm: 46, name: "Medium format 44x33" },
  { minWidthMm: 33, maxWidthMm: 40, name: "Full frame" },
  { minWidthMm: 26, maxWidthMm: 33, name: "APS-H" },
  { minWidthMm: 20, maxWidthMm: 26, name: "APS-C" },
  { minWidthMm: 15, maxWidthMm: 20, name: "Four Thirds" },
  { minWidthMm: 11, maxWidthMm: 15, name: "1″" },
  { minWidthMm: 7.0, maxWidthMm: 8.0, name: '1/1.7"' },
  { minWidthMm: 5.5, maxWidthMm: 7.0, name: '1/2.3"' },
];

// Checked before the dimensions, for pages that name the format outright.
// Order matters: "APS-H" must be tested before "APS-C" would ever be, and
// "Medium format" is the coarsest fallback of the three.
const SENSOR_NAMES: [RegExp, string][] = [
  [/aps-?h/i, "APS-H"],
  [/aps-?c/i, "APS-C"],
  [/(micro )?four ?thirds|\bmft\b/i, "Four Thirds"],
  [/full[- ]frame/i, "Full frame"],
  [/medium format/i, "Medium format"],
];

/**
 * DPReview's "Sensor size" → the format name used by cameras.sensor_size.
 * Returns null rather than guessing: an unmapped size stays visible in the
 * raw specs jsonb, and a null column is honest where a wrong facet is not.
 */
export function mapSensorSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [re, name] of SENSOR_NAMES) {
    if (re.test(raw)) return name;
  }
  const m = raw.match(/(\d+\.?\d*)\s*[×x]\s*(\d+\.?\d*)\s*mm/i);
  if (!m) return null;
  const width = parseFloat(m[1]);
  for (const band of SENSOR_BANDS) {
    if (width >= band.minWidthMm && width < band.maxWidthMm) return band.name;
  }
  return null;
}

/**
 * Deterministic mapping of a DPReview camera "Full Specs" table into typed
 * camera columns. Unknown labels are ignored here but survive in the raw
 * specs jsonb, so markup drift degrades gracefully.
 *
 * Deliberately not mapped:
 * - shutterType, which holds a mechanism ("Focal-plane") that DPReview does
 *   not publish; it lists shutter speeds instead.
 * - builtInLensId, which needs a real lenses row to point at. A fixed-lens
 *   body therefore arrives with a null system and no built-in lens, exactly
 *   as one submitted by hand would, for an admin to complete.
 */
export function mapDpreviewCameraSpecs(
  candidate: DpreviewCameraCandidate,
): Record<string, unknown> {
  const { name, specTable: specs } = candidate;

  const megapixels = parseMegapixels(specs["Effective pixels"]);
  const yearIntroduced = candidateYear(candidate);

  return {
    name,
    slug: cameraSlug(name, yearIntroduced),
    url: candidate.dpreviewUrl,
    sensorType: specs["Sensor type"]?.trim() || null,
    sensorSize: mapSensorSize(specs["Sensor size"]),
    megapixels,
    resolution: mapResolution(specs["Max resolution"], megapixels),
    bodyType: specs["Body type"]?.trim() || null,
    weightG: parseWeight(specs["Weight (inc. batteries)"] || specs["Weight"]),
    yearIntroduced,
    systemId: null, // filled in by the caller via findSystemId
    specs,
  };
}

/**
 * The announcement year: the spec table where it carries one, otherwise the
 * year read off the index row. Shared by the mapper and the duplicate check
 * so a candidate is never matched on a different year than it is stored with.
 */
export function candidateYear(candidate: DpreviewCameraCandidate): number | null {
  const fromSpecs = (
    candidate.specTable["Announced"] ||
    candidate.specTable["Year"] ||
    ""
  ).match(/(\d{4})/)?.[1];
  return fromSpecs ? parseInt(fromSpecs, 10) : candidate.year ?? null;
}

/** The mount string DPReview publishes for an interchangeable-lens body. */
export function cameraMountString(candidate: DpreviewCameraCandidate): string | undefined {
  return candidate.specTable["Lens mount"];
}

/**
 * Aggressive normalization for exact-duplicate name matching.
 *
 * "Mark" is dropped because the database spells the same idea both ways
 * ("OM System OM-1 Mark II" alongside "OM System OM-5 II"), and DPReview is
 * no more consistent, so "Canon EOS R5 Mark II" and "Canon EOS R5 II" must
 * normalize alike.
 */
export function aggressiveNormCamera(name: string): string {
  return name
    .toLowerCase()
    .replace(/^om system/, "olympus")
    .replace(/^om-system/, "olympus")
    .replace(/\bmark\s*/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface ExistingCamera {
  id: number;
  name: string;
  slug: string;
  yearIntroduced: number | null;
  megapixels: number | null;
}

/**
 * Duplicate detection for bodies, the camera analogue of findDuplicate():
 * 1. Exact match on aggressively normalized name
 * 2. Same brand + same resolution + year within ±1
 * 3. Slug collision (would violate cameras_slug_unique at approval time)
 *
 * A hit is a *suspicion*, not a verdict — the caller puts it to the LLM and
 * parks anything under 90% confidence for manual review. So pass 2 is
 * deliberately loose enough to catch sibling bodies announced together
 * (Lumix DC-S1II and DC-S1IIE): the cost of a false suspicion is one LLM
 * call, the cost of a miss is a duplicate row.
 */
export function findDuplicateCamera(
  candidateName: string,
  candidateYear: number | null,
  candidateMegapixels: number | null,
  existing: ExistingCamera[],
): ExistingCamera | null {
  const norm = aggressiveNormCamera(candidateName);
  for (const camera of existing) {
    if (aggressiveNormCamera(camera.name) === norm) return camera;
  }

  const brand = extractBrand(candidateName);
  if (candidateMegapixels !== null && candidateYear) {
    for (const camera of existing) {
      if (
        extractBrand(camera.name) === brand &&
        camera.megapixels !== null &&
        Math.round(camera.megapixels) === Math.round(candidateMegapixels) &&
        camera.yearIntroduced &&
        Math.abs(camera.yearIntroduced - candidateYear) <= 1
      ) {
        return camera;
      }
    }
  }

  // Both slug conventions in the catalogue are checked. The bodies this
  // watcher extends are slugged "<name>-<year>", but the camera-wiki film
  // import writes a bare "<name>", and either shape colliding would break the
  // insert at approval time.
  const slugs = new Set([cameraSlug(candidateName, candidateYear), generateSlug(candidateName)]);
  for (const camera of existing) {
    if (slugs.has(camera.slug)) return camera;
  }

  return null;
}
