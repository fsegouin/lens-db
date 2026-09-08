/**
 * Build a refined eBay search query from a camera name.
 * Strips historical manufacturer prefixes and appends "camera body"
 * to avoid irrelevant results (e.g. lenses with matching f-stop numbers).
 *
 * Parenthesised content goes too. The catalogue writes the names a body was
 * sold under elsewhere in brackets, "Canon EOS Rebel T6i (EOS 750D / Kiss
 * X8i)", and the Browse API wants every one of those words in the title,
 * which no listing has. The scraper this replaced stripped them; the first
 * sweep through this function did not, and the Rebels came back empty.
 */
export function buildEbaySearchQuery(cameraName: string): string {
  let name = cameraName.replace(/\s*\([^)]*\)/g, "").trim();
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  return `${name} camera body`;
}

/**
 * The camera query for a set of seller-style keywords. Only "camera" is
 * appended, not "camera body": this query runs when the stricter one has
 * already found nothing, and "body" is a word many bodies are listed
 * without ("Nikon FM2n 35mm SLR w/ 50mm"). The judge handles bundles.
 */
export function cameraQueryFromKeywords(keywords: string): string {
  return `${keywords} camera`;
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
 * Tidy the keywords a model wrote for a lens or a body, or return null when
 * they are not usable as a Browse API query.
 *
 * Whitespace is collapsed, a trailing "lens", "camera" or "camera body" is
 * dropped because the wrapper adds its own, and words beginning with "-" are
 * refused outright: on eBay a leading minus excludes a word, and a query that
 * excluded the product's own name would search for everything but it.
 */
export function cleanSearchKeywords(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let keywords = raw
    .replace(/["'`“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  keywords = keywords.replace(/\s+(lens|camera body|camera|body)$/i, "").trim();
  if (keywords.length === 0 || keywords.length > MAX_KEYWORDS_LENGTH) return null;
  if (keywords.split(" ").some((w) => w.startsWith("-"))) return null;
  return keywords;
}
