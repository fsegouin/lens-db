/**
 * Checks on what the lens-db.com sitemap hands the gap scripts. Both values
 * come from a third party and become catalogue fields: the slug a URL path,
 * a cache tag and an image directory name, the url the row's source.
 */

/** The shape generateSlug produces: lowercase ASCII words joined by single hyphens. */
export const isCatalogueSlug = (s) => typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

/** An http(s) page on lens-db.com itself, matched by its real host. */
export function isLensDbUrl(u) {
  try {
    const url = new URL(u);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      (url.hostname === "lens-db.com" || url.hostname === "www.lens-db.com");
  } catch {
    return false;
  }
}
