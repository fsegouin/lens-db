const ALLOWED_PREFIXES = [
  "/images/",
  "https://pub-452f806914084c1384d3fafe70f6be32.r2.dev/",
];

export function isAllowedImageSrc(src: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => src.startsWith(prefix));
}

/**
 * Cheap first-image lookup for table rows / cards. Pulls straight from the
 * `images` JSONB column (skips the filesystem check that getImages() does)
 * so it stays cheap when called in a loop.
 */
export function firstImageSrc(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    const src = (img as { src?: unknown })?.src;
    if (typeof src === "string" && isAllowedImageSrc(src)) return src;
  }
  return null;
}
