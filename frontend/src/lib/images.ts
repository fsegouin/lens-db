import fs from "fs";
import path from "path";

type ImageData = { src: string; alt: string };

const ALLOWED_PREFIXES = [
  "/images/",
  "https://pub-452f806914084c1384d3fafe70f6be32.r2.dev/",
];

export function isAllowedImageSrc(src: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => src.startsWith(prefix));
}

/**
 * Get images for a lens or camera, preferring local files over remote URLs.
 * Local images are served from /images/{type}/{slug}/; DB image URLs are
 * filtered to the allowed-src whitelist so callers can rely on `.length > 0`
 * meaning "something will actually render".
 */
export function getImages(
  type: "lenses" | "cameras",
  slug: string,
  dbImages: ImageData[] | null,
): ImageData[] {
  const dirSlug = slug.replace(/\//g, "__");
  if (dirSlug.includes("..")) return (dbImages ?? []).filter((img) => isAllowedImageSrc(img.src));
  const localDir = path.join(process.cwd(), "public", "images", type, dirSlug);

  try {
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir).filter((f) =>
        /\.(jpe?g|png|gif|webp)$/i.test(f),
      );
      if (files.length > 0) {
        return files.map((f) => ({
          src: `/images/${type}/${dirSlug}/${f}`,
          alt: "",
        }));
      }
    }
  } catch {
    // Fall through to DB images
  }

  return (dbImages ?? []).filter((img) => isAllowedImageSrc(img.src));
}
