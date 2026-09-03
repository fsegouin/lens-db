import fs from "fs";
import path from "path";
import type { ImageData } from "./image-types";

/** Filename stem, lowercased, for matching a cached file back to its DB row. */
function stem(filename: string): string {
  return path.basename(filename, path.extname(filename)).toLowerCase();
}

/**
 * Get images for a lens or camera, preferring local files over remote URLs.
 * Local images are served from /images/{type}/{slug}/
 *
 * Local files are only a cache of what the DB row already points at, so the
 * licence and background metadata are carried across from the matching DB
 * entry. Dropping it would strip the credit line off every CC BY-SA image that
 * happens to be cached on disk.
 */
export function getImages(
  type: "lenses" | "cameras",
  slug: string,
  dbImages: ImageData[] | null
): ImageData[] {
  const dirSlug = slug.replace(/\//g, "__");
  if (dirSlug.includes("..")) return dbImages || [];
  const localDir = path.join(process.cwd(), "public", "images", type, dirSlug);

  try {
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir).filter((f) =>
        /\.(jpe?g|png|gif|webp)$/i.test(f)
      );
      if (files.length > 0) {
        const byStem = new Map(
          (dbImages || []).map((img) => [stem(img.src.split("?")[0]), img])
        );
        return files.map((f, i) => {
          const source = byStem.get(stem(f)) ?? dbImages?.[i];
          return {
            ...source,
            src: `/images/${type}/${dirSlug}/${f}`,
            alt: source?.alt ?? "",
          };
        });
      }
    }
  } catch {
    // Fall through to DB images
  }

  return dbImages || [];
}
