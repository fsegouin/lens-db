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
  return `${name} lens -body -kit -bundle`;
}
