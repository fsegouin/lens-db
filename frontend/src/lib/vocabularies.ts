/**
 * The controlled vocabularies, and how to get a written value into one.
 *
 * These four columns are filtered with exact equality, so every extra spelling
 * is a filter that silently returns nothing. "coverage" had reached 17
 * spellings for six concepts, which is why the Medium Format filter matched no
 * lens at all: every medium format lens was recorded with a capital F.
 *
 * Anything that cannot be mapped becomes null rather than a new value. The
 * columns had also picked up values belonging to other columns entirely, and a
 * scrape artifact like "Announced in March 1973" can never be a facet; the
 * year it holds is already in year_introduced, so nothing is lost by dropping
 * it.
 */

/**
 * Coverage is an image circle, not a mount. Four Thirds and Micro Four Thirds
 * lenses cover the same sensor, so they share one value; the slug is the one
 * already used by the importer, the filter and the submission form.
 */
export const COVERAGE = [
  "full-frame",
  "aps-c",
  "micro-four-thirds",
  "medium-format",
  "one-inch",
] as const;

export const ERA = ["Film era", "Digital era"] as const;

export const PRODUCTION_STATUS = [
  "In production",
  "Discontinued",
  "Not yet in production",
  "Collectible",
] as const;

export function normalizeCoverage(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  // A list of mounts is not a coverage; it was written to the wrong column.
  if (v.includes(",")) return null;
  if (v.includes("35mm") || v.includes("full frame") || v === "full-frame") {
    return "full-frame";
  }
  if (v.includes("aps-c") || v.includes("aps c")) return "aps-c";
  if (v.includes("four") && v.includes("third")) return "micro-four-thirds";
  if (v.includes("fourthirds")) return "micro-four-thirds";
  if (v.includes("medium format") || v === "medium-format") return "medium-format";
  if (v === "1" || v.includes("1-inch") || v.includes("1 inch") || v.includes('1"')) {
    return "one-inch";
  }
  return null;
}

export function normalizeEra(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith("film") || v === "vintage") return "Film era";
  if (v.startsWith("digital")) return "Digital era";
  return null;
}

export function normalizeProductionStatus(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  // "Discontinued (Canon EF-M, Canon RF)" says which mounts went, which the
  // lens_systems table already records. The status is the part before it.
  const v = value.trim().replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
  if (v === "in production") return "In production";
  if (v === "discontinued") return "Discontinued";
  if (v === "not yet in production") return "Not yet in production";
  if (v === "collectible") return "Collectible";
  return null;
}

/**
 * Lens type is an open taxonomy rather than a closed set, so this only settles
 * casing and number. Two spellings of teleconverter and a stray "wide Angle
 * prime" were splitting rows that belong together.
 */
const LENS_TYPE_FIXES: Record<string, string> = {
  teleconverter: "Teleconverter",
  accessory: "Accessory",
  "body cap lenses": "Body cap lens",
  "wide angle prime": "Wide-angle prime lens",
};

export function normalizeLensType(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return LENS_TYPE_FIXES[trimmed.toLowerCase()] ?? trimmed;
}
