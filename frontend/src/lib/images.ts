import fs from "fs";
import path from "path";

type ImageData = { src: string; alt: string };

/**
 * Get images for a lens or camera, preferring local files over remote URLs.
 * Local images are served from /images/{type}/{slug}/
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
        return files.map((f) => ({
          src: `/images/${type}/${dirSlug}/${f}`,
          alt: "",
        }));
      }
    }
  } catch {
    // Fall through to DB images
  }

  return dbImages || [];
}
