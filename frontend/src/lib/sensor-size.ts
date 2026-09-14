/**
 * The vocabulary of cameras.sensor_size, and the one function every write
 * path runs a label through.
 *
 * sensor_size is an exact-match browse facet (the cameras index, mount pages
 * and the public API filter on it), so every spelling of a format is a
 * separate filter entry. Three importers plus hand edits had produced eighty
 * of them: "35mm full frame" beside "Full frame", '1/2.3"' beside "1″",
 * raw millimetre strings ("27.4 x 18.1 mm") for a single body each, and
 * "Medium format" stuck on cm plate sizes and 127 roll-film frames alike.
 *
 * The rules, in the order they are applied:
 *
 * - The 35mm-sized format is spelled two ways on purpose: "35mm" on film
 *   bodies and "Full frame" on sensors. "Full frame" is a digital-era term
 *   meaning "a sensor the size of a 35mm frame"; a film camera is simply a
 *   35mm camera. Whether a body is digital is the caller's to say; a boolean
 *   or the row's megapixel count both work.
 * - Fractional-inch sensor classes use the double prime: 1″, 2/3″, 1/1.7″,
 *   1/2.3″. DPReview mixes the prime and the straight quote.
 * - A measured sensor ("35.9 × 23.9 mm") on a digital body becomes its class
 *   by the longer side. A film frame is never measured into a sensor class:
 *   an 18 x 24 mm half frame is not APS-C. Digital medium format is named by
 *   its nominal size in millimetres ("Medium format 44x33").
 * - Roll film is named by its frame when known ("Medium format 6x6") and by
 *   its film number when not ("127 film"); plate cameras by their plate size
 *   ("Plate 9x12") and sheet film by the inch size ("Sheet film 4x5").
 * - Anything else passes through trimmed: an admin can still write a label
 *   this file does not know, and the list below is what the site prefers,
 *   not a constraint.
 */

/** Labels the site prefers, roughly widest first within each family. */
export const SENSOR_SIZES = {
  digital: [
    "Medium format 54x40",
    "Medium format 49x37",
    "Medium format 45x30",
    "Medium format 44x33",
    "Medium format 37x37",
    "Full frame",
    "APS-H",
    "APS-C",
    "Four Thirds",
    "1″",
    "2/3″",
    "1/1.7″",
    "1/2.3″",
  ],
  film: [
    "Sheet film 8x10",
    "Sheet film 5x7",
    "Sheet film 4x5",
    "Sheet film 3x4",
    "Plate 9x12",
    "Plate 8x12",
    "Plate 8x10.5",
    "Plate 6.5x9",
    "Plate 5.5x8",
    "Plate",
    "Medium format 6x17",
    "Medium format 6x12",
    "Medium format 6x9",
    "Medium format 6x8",
    "Medium format 6x7",
    "Medium format 6x6",
    "Medium format 6x4.5",
    "Medium format 6.5x11",
    "Medium format 4x6.5",
    "Medium format 4x5",
    "Medium format 4x4",
    "Medium format 3x4",
    "122 film",
    "130 film",
    "120 film",
    "116 film",
    "620 film",
    "127 film",
    "828 film",
    "126 film",
    "35mm panoramic",
    "35mm",
    "Half frame",
    "APS film",
    "110 film",
    "Subminiature",
    "Instant film",
  ],
} as const;

/** Width bands, in millimetres of the longer side, for a measured sensor. */
const SENSOR_BANDS: { min: number; max: number; name: string }[] = [
  { min: 51, max: 70, name: "Medium format 54x40" },
  { min: 46, max: 51, name: "Medium format 49x37" },
  { min: 40, max: 46, name: "Medium format 44x33" },
  { min: 35, max: 40, name: "Full frame" },
  { min: 26, max: 35, name: "APS-H" },
  { min: 20, max: 26, name: "APS-C" },
  { min: 16, max: 18.5, name: "Four Thirds" },
  { min: 11, max: 15, name: "1″" },
  { min: 8.0, max: 11, name: "2/3″" },
  { min: 7.0, max: 8.0, name: "1/1.7″" },
  { min: 5.5, max: 7.0, name: "1/2.3″" },
];

const INCH = String.raw`\s*(″|"|''|-?\s*inch|in)?(\s*type)?`;

// Spellings the importers and forms have produced. Every rule is anchored at
// both ends, so the whole string is replaced by a fixed, correctly cased name.
const SYNONYMS: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^aps-?h$/i, "APS-H"],
  [/^aps-?c$/i, "APS-C"],
  [/^(micro ?)?four ?thirds$|^mft$|^m4\/3$|^4\/3$/i, "Four Thirds"],
  [new RegExp(`^1\\s*(″|"|''|-?\\s*inch|in)(\\s*type)?$`, "i"), "1″"],
  [new RegExp(`^(\\d)\\/(\\d(?:\\.\\d)?)${INCH}$`, "i"), (m) => `${m[1]}/${m[2]}″`],
  [/^medium format 6\.5x4$/i, "Medium format 4x6.5"],
  [/^medium format (6\.5x9|9x12|8x12|8x10\.5|5\.5x8)$/i, (m) => `Plate ${m[1].toLowerCase()}`],
  [/^medium format 120$/i, "120 film"],
  [/^616 film$/i, "Medium format 6.5x11"],
  [/^half[- ]frame$/i, "Half frame"],
  [/^(aps|advanced photo system) film$/i, "APS film"],
  [/^instant( film)?$/i, "Instant film"],
];

function applySynonyms(value: string): string | null {
  for (const [re, name] of SYNONYMS) {
    const m = value.match(re);
    if (m) return typeof name === "string" ? name : name(m);
  }
  return null;
}

// DPReview's own wording, looked at before the measurement it brackets, e.g.
// "APS-C (23.5 x 15.6 mm)". "Medium format" alone is not enough: the
// measurement decides between 44x33 and 54x40.
const NAMED: [RegExp, string][] = [
  [/\baps-?h\b/i, "APS-H"],
  [/\baps-?c\b/i, "APS-C"],
  [/\b(micro )?four ?thirds\b|\bmft\b/i, "Four Thirds"],
  [/\bfull[- ]frame\b/i, "Full frame"],
];

const MEASUREMENT = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm/i;

/**
 * A measured sensor ("35.9 × 23.9 mm", "33.1 x 44.2 mm") to its size class
 * by the longer side, or null when nothing is measured or the width sits
 * between classes.
 */
export function sensorSizeFromDimensions(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(MEASUREMENT);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  const width = Math.max(a, b);
  const height = Math.min(a, b);
  // Two medium-format sensors share a width band with a neighbour and are
  // told apart by their shape: the Leica S sensor is 3:2 at 45 mm wide, and
  // the Kodak ProBack is square at 36.7 mm.
  if (width >= 44.5 && width < 46 && height < 31.5) return "Medium format 45x30";
  if (width >= 36 && width < 40 && height / width > 0.9) return "Medium format 37x37";
  for (const band of SENSOR_BANDS) {
    if (width >= band.min && width < band.max) return band.name;
  }
  return null;
}

/**
 * DPReview's "Sensor size" row ("APS-C (23.5 x 15.6 mm)", '1/2.3" (6.17 x
 * 4.55 mm)', "Medium format (43.8 x 32.9 mm)") to the format name. Returns
 * null rather than guessing: an unmapped size stays visible in the raw specs
 * jsonb, and a null column is honest where a wrong facet is not.
 */
export function mapSensorSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [re, name] of NAMED) {
    if (re.test(raw)) return name;
  }
  const measured = sensorSizeFromDimensions(raw);
  if (measured) return measured;
  return applySynonyms(raw.replace(/\(.*?\)/g, "").trim());
}

function isDigitalFlag(digital: unknown): boolean {
  if (typeof digital === "boolean") return digital;
  return digital != null && digital !== "" && Number.isFinite(Number(digital));
}

/**
 * Whatever wording a form or an importer sends, to the label the site uses.
 * `digital` is either a boolean or the row's megapixels; a body with a
 * megapixel count is digital, one without is treated as film.
 */
export function normalizeSensorSize(value: unknown, digital: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isDigital = isDigitalFlag(digital);
  if (/^(35\s*mm\s+)?full[\s-]*frame$/i.test(trimmed)) {
    return isDigital ? "Full frame" : "35mm";
  }
  if (/^35\s*mm(\s+film)?$/i.test(trimmed)) return isDigital ? "Full frame" : "35mm";
  const synonym = applySynonyms(trimmed);
  if (synonym) return synonym;
  const whole = trimmed.match(new RegExp(`^${MEASUREMENT.source}$`, "i"));
  if (whole) {
    const w = Math.max(parseFloat(whole[1]), parseFloat(whole[2]));
    const h = Math.min(parseFloat(whole[1]), parseFloat(whole[2]));
    const is35 = w >= 35.5 && w <= 36.5 && h >= 23.5 && h <= 24.5;
    if (!isDigital) return is35 ? "35mm" : trimmed;
    return sensorSizeFromDimensions(trimmed) ?? trimmed;
  }
  return trimmed;
}
