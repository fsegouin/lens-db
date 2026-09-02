/**
 * Shared logic for the DPReview new-lens watcher pipeline.
 *
 * Ported from the one-off import scripts (scripts/import-new-lenses.mjs and
 * scripts/check-lens-duplicates-v3.mjs) so the cron route can reuse the same
 * parsing, mount-mapping, and duplicate-detection behavior server-side.
 */

export const DPREVIEW_BOT_EMAIL = "dpreview-watcher@thelensdb.com";
export const DPREVIEW_BOT_DISPLAY_NAME = "DPReview Watcher";

export interface DpreviewCandidate {
  dpreviewSlug: string;
  dpreviewUrl: string;
  name: string;
  specTable: Record<string, string>;
  imageUrls: string[];
  mounts?: string;
  year?: number;
  price?: string;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Multi-word brands checked first (longest match)
const MULTI_WORD_BRANDS: [string, string][] = [
  ["Carl Zeiss Jena", "Carl Zeiss Jena"],
  ["Carl Zeiss", "Carl Zeiss"],
  ["HD Pentax", "Pentax"],
  ["smc Pentax", "Pentax"],
  ["SMC Pentax", "Pentax"],
  ["Asahi Pentax", "Pentax"],
  ["Nippon Kogaku", "Nikon"],
  ["Venus Optics", "Laowa"],
  ["OM System", "Olympus"],
  ["Meyer-Optik", "Meyer-Optik Görlitz"],
  ["Brightin Star", "Brightin Star"],
  ["Light Lens Lab", "Light Lens Lab"],
  ["MS Optics", "MS Optics"],
];

const BRAND_ALIASES: Record<string, string> = {
  "7Artisans": "7Artisans", "7artisans": "7Artisans",
  Canon: "Canon", Fujifilm: "Fuji", Fujica: "Fuji",
  Hasselblad: "Hasselblad", Holga: "Holga", Irix: "Irix",
  Kamlan: "Kamlan", Kenko: "Kenko", Laowa: "Laowa", Leica: "Leica",
  Lensbaby: "Lensbaby", LK: "LK", Meike: "Meike", Minolta: "Minolta",
  Nikon: "Nikon", Nikkor: "Nikon", NiSi: "NiSi", Olympus: "Olympus",
  Panasonic: "Panasonic", Pentax: "Pentax", Samsung: "Samsung",
  Samyang: "Samyang", Schneider: "Schneider-Kreuznach",
  Sigma: "Sigma", Sirui: "Sirui", Sony: "Sony",
  Tamron: "Tamron", Tokina: "Tokina", Viltrox: "Viltrox",
  Voigtlander: "Voigtländer", Zeiss: "Carl Zeiss", Hartblei: "Hartblei",
  Mamiya: "Mamiya", Komura: "Komura", Rollei: "Rollei",
  Exakta: "Exakta", Contax: "Contax",
};

export function extractBrand(name: string): string {
  for (const [prefix, brand] of MULTI_WORD_BRANDS) {
    if (name.startsWith(prefix)) return brand;
  }
  const firstWord = name.split(" ")[0];
  return BRAND_ALIASES[firstWord] || firstWord;
}

export const MOUNT_MAP: Record<string, string> = {
  "nikon z": "nikon z",
  "nikon f": "nikon f",
  "nikon 1": "nikon 1",
  "canon rf-s": "canon rf-s",
  "canon rf": "canon rf",
  "canon ef-s": "canon ef",
  "canon ef-m": "canon ef-m",
  "canon ef": "canon ef",
  "sony fe": "sony e",
  "sony e": "sony e",
  "sony/minolta alpha": "minolta/sony a",
  "fujifilm x": "fujifilm x",
  "fujifilm g": "fujifilm g",
  "micro four thirds": "micro four thirds",
  "four thirds": "four thirds",
  "pentax q": "pentax q",
  "pentax k": "pentax k",
  "pentax 645": "pentax 645",
  "samsung nx-m": "samsung nx-m",
  "samsung nx": "samsung nx",
  "leica m": "leica m",
  "leica l": "leica l",
  "l-mount": "leica l",
  "leica t": "leica l",
  "leica tl": "leica l",
  "sigma sa": "sigma sa",
  "hasselblad x": "hasselblad x",
};

export function findSystemId(
  mount: string | null | undefined,
  systems: { id: number; name: string }[],
): number | null {
  if (!mount) return null;

  const lookupSystemByName = (sysName: string): number | null => {
    // Exact-match pass first so e.g. 'canon ef' never resolves to 'canon ef-m'
    for (const sys of systems) {
      if (sys.name.toLowerCase() === sysName) return sys.id;
    }
    for (const sys of systems) {
      if (sys.name.toLowerCase().includes(sysName)) return sys.id;
    }
    return null;
  };

  // Take first mount if multi-mount
  const firstMount = mount.toLowerCase().split(",")[0].trim();
  // Exact mount-key pass before the order-dependent substring pass
  if (MOUNT_MAP[firstMount]) {
    const id = lookupSystemByName(MOUNT_MAP[firstMount]);
    if (id) return id;
  }
  for (const [key, sysName] of Object.entries(MOUNT_MAP)) {
    if (firstMount.includes(key)) {
      const id = lookupSystemByName(sysName);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Map every mount in a comma-separated DPReview mount string to a system id
 * (deduplicated, in listed order). findSystemId keeps only the first — the
 * primary/reference mount.
 */
export function findAllSystemIds(
  mounts: string | null | undefined,
  systems: { id: number; name: string }[],
): number[] {
  if (!mounts) return [];
  const ids: number[] = [];
  for (const mount of mounts.split(",")) {
    const id = findSystemId(mount.trim(), systems);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function parseFocal(str: string | null | undefined): { min: number; max: number } | null {
  if (!str) return null;
  // Strip thousands separators so "1,070" never parses as 70
  const range = str.replace(/,(?=\d{3})/g, "").match(/(\d+\.?\d*)\s*(?:-\s*(\d+\.?\d*))?\s*mm/i);
  if (!range) return null;
  return {
    min: parseFloat(range[1]),
    max: range[2] ? parseFloat(range[2]) : parseFloat(range[1]),
  };
}

// The "f" must start a word so mount prefixes (RF/EF/AF) followed by a focal
// length ("RF 50mm") are never parsed as apertures. The slash is optional
// because DPReview writes apertures as "F2.8" (names and spec values alike).
const APERTURE_RE = /(?:^|[\s(])[fF]\/?(\d+\.?\d*)/;

export function parseAperture(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(APERTURE_RE);
  return m ? parseFloat(m[1]) : null;
}

export function parseWeight(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.replace(/,(?=\d{3})/g, "").match(/(\d+\.?\d*)\s*g/);
  return m ? parseFloat(m[1]) : null;
}

export function parseMinFocus(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.replace(/,(?=\d{3})/g, "").match(/(\d+\.?\d*)\s*m/);
  return m ? parseFloat(m[1]) : null;
}

function parseIntOrNull(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseFloatOrNull(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

function mapCoverage(formatSize: string | undefined): string | null {
  if (!formatSize) return null;
  const v = formatSize.toLowerCase();
  if (v.includes("35mm ff") || v.includes("full frame")) return "full-frame";
  if (v.includes("aps-c")) return "aps-c";
  if (v === "ft" || v.includes("four thirds")) return "micro-four-thirds";
  return null;
}

/**
 * Deterministic mapping of a DPReview "Full Specs" table (label → value) plus
 * the lens name into typed lens columns. Unknown labels are ignored here but
 * survive in the raw specs jsonb, so markup drift degrades gracefully.
 */
export function mapDpreviewSpecs(candidate: DpreviewCandidate): Record<string, unknown> {
  const { name, specTable: specs } = candidate;
  const nameLower = name.toLowerCase();

  const focal = parseFocal(specs["Focal length"] || name);
  const apertureMin = parseAperture(specs["Maximum aperture"] || name);
  const apertureMax = parseAperture(specs["Minimum aperture"]);
  const yearFromSpecs =
    (specs["Announced"] || specs["Year"] || "").match(/(\d{4})/)?.[1];

  const hasAutofocus =
    specs["Autofocus"] !== undefined
      ? specs["Autofocus"] !== "No"
      : nameLower.includes(" af ");
  const hasStabilization =
    specs["Image stabilization"] === "Yes" ||
    nameLower.includes(" ois ") ||
    nameLower.includes(" vr ") ||
    nameLower.includes(" oss ");

  return {
    name,
    slug: generateSlug(name),
    url: candidate.dpreviewUrl,
    brand: extractBrand(name),
    lensType: specs["Lens type"] || null,
    focalLengthMin: focal?.min ?? null,
    focalLengthMax: focal?.max ?? null,
    apertureMin,
    apertureMax,
    weightG: parseWeight(specs["Weight"]),
    filterSizeMm: parseFloatOrNull(specs["Filter thread"]),
    minFocusDistanceM: parseMinFocus(specs["Minimum focus"]),
    maxMagnification: parseFloatOrNull(specs["Maximum magnification"]),
    lensElements: parseIntOrNull(specs["Elements"]),
    lensGroups: parseIntOrNull(specs["Groups"]),
    diaphragmBlades: parseIntOrNull(specs["Number of diaphragm blades"]),
    yearIntroduced: yearFromSpecs ? parseInt(yearFromSpecs, 10) : candidate.year ?? null,
    isZoom: focal ? focal.min !== focal.max : false,
    isPrime: focal ? focal.min === focal.max : false,
    isMacro: nameLower.includes("macro"),
    hasAutofocus,
    hasStabilization,
    coverage: mapCoverage(specs["Max Format size"]),
    systemId: null, // filled in by the caller via findSystemId
    specs,
  };
}

// Aggressive normalization for exact-duplicate name matching
export function aggressiveNorm(name: string): string {
  return name
    .toLowerCase()
    .replace(/^carl zeiss/, "zeiss")
    .replace(/^venus optics/, "laowa")
    .replace(/^smc pentax/, "pentax")
    .replace(/^hd pentax/, "pentax")
    .replace(/^fujifilm super ebc fujinon/, "fujifilm")
    .replace(/^fujifilm fujinon/, "fujifilm")
    .replace(/^fujinon/, "fujifilm")
    .replace(/^panasonic lumix/, "panasonic")
    .replace(/^om system m\.zuiko/, "olympus")
    .replace(/^om system/, "olympus")
    .replace(/^olympus m\.zuiko/, "olympus")
    .replace(/^m\.zuiko/, "olympus")
    .replace(/f\/(\d)/gi, "f$1")
    .replace(/[^a-z0-9]/g, "");
}

// Extract a coarse brand|focal|aperture key from a lens name for duplicate
// detection when normalized names differ
function extractNameSpecs(name: string) {
  const focal = name.match(/(\d+)(?:\s*-\s*(\d+))?\s*mm/i);
  const aperture = name.match(APERTURE_RE);
  const brandWord = name.split(/\s+/)[0].toLowerCase()
    .replace("carl", "zeiss").replace("venus", "laowa")
    .replace("fujinon", "fujifilm").replace("smc", "pentax")
    .replace("hd", "pentax");
  return {
    focalMin: focal ? focal[1] : null,
    focalMax: focal ? focal[2] || focal[1] : null,
    aperture: aperture ? aperture[1] : null,
    brand: brandWord,
  };
}

export interface ExistingLens {
  id: number;
  name: string;
  slug: string;
  yearIntroduced: number | null;
}

/**
 * Duplicate detection, ported from check-lens-duplicates-v3.mjs:
 * 1. Exact match on aggressively normalized name
 * 2. Same brand + focal range + aperture with year within ±1
 * 3. Slug collision (would violate the unique constraint at approval time)
 */
export function findDuplicate(
  candidateName: string,
  candidateYear: number | null,
  existing: ExistingLens[],
): ExistingLens | null {
  const norm = aggressiveNorm(candidateName);
  for (const lens of existing) {
    if (aggressiveNorm(lens.name) === norm) return lens;
  }

  const s = extractNameSpecs(candidateName);
  if (s.focalMin && s.aperture && candidateYear) {
    for (const lens of existing) {
      const e = extractNameSpecs(lens.name);
      if (
        e.brand === s.brand &&
        e.focalMin === s.focalMin &&
        e.focalMax === s.focalMax &&
        e.aperture === s.aperture &&
        lens.yearIntroduced &&
        Math.abs(lens.yearIntroduced - candidateYear) <= 1
      ) {
        return lens;
      }
    }
  }

  const slug = generateSlug(candidateName);
  for (const lens of existing) {
    if (lens.slug === slug) return lens;
  }

  return null;
}
