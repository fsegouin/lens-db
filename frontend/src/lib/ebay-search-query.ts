/**
 * Build a refined eBay search query from a camera name.
 * Strips historical manufacturer prefixes and appends "camera body"
 * to avoid irrelevant results (e.g. lenses with matching f-stop numbers).
 */
export function buildEbaySearchQuery(cameraName: string): string {
  let name = cameraName;
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  return `${name} camera body`;
}

/**
 * Build a refined eBay search query from a lens name.
 * Strips parenthesized content and excludes camera body bundles.
 */
export function buildEbayLensSearchQuery(lensName: string): string {
  const name = lensName.replace(/\s*\([^)]*\)/g, "").trim();
  return lensQueryFromKeywords(name);
}

/**
 * The lens query for a set of keywords, with the exclusions every lens
 * search carries. Shared by the catalogue-name query and the looser one a
 * model writes when the catalogue name finds nothing, so the two differ only
 * in their keywords.
 */
export function lensQueryFromKeywords(keywords: string): string {
  return `${keywords} lens -body -kit -bundle`;
}

/**
 * Longest keyword string accepted from the model. A seller's title is
 * eighty characters, and a query longer than that is the catalogue name
 * again, not a shorter one.
 */
const MAX_KEYWORDS_LENGTH = 80;

/**
 * Tidy the keywords a model wrote for a lens, or return null when they are
 * not usable as a Browse API query.
 *
 * Whitespace is collapsed, a trailing "lens" is dropped because the wrapper
 * adds one, and words beginning with "-" are refused outright: on eBay a
 * leading minus excludes a word, and a query that excluded the lens's own
 * name would search for everything but it.
 */
export function cleanLensKeywords(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let keywords = raw
    .replace(/["'`“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  keywords = keywords.replace(/\s+lens$/i, "").trim();
  if (keywords.length === 0 || keywords.length > MAX_KEYWORDS_LENGTH) return null;
  if (keywords.split(" ").some((w) => w.startsWith("-"))) return null;
  return keywords;
}
