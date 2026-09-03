/**
 * Shape of one entry in `cameras.images` / `lenses.images` (jsonb).
 *
 * `src` and `alt` are the original two fields and are always present. The rest
 * arrived with the Wikimedia Commons backfill: CC BY / CC BY-SA images may only
 * be used with visible credit, so the licence travels with the image rather
 * than living in a scraper log somewhere.
 *
 * `background` is set by the ingest classifier and tells the gallery what to
 * put behind the image. A studio shot on white needs a white plate in both
 * themes, or it reads as a glowing rectangle on the dark theme.
 */
export type ImageBackground = "alpha" | "white" | "plain" | "scene";

export type ImageData = {
  src: string;
  alt: string;
  /** Plain-text author, e.g. "Jane Doe". Absent for images with no attribution requirement. */
  credit?: string;
  /** Human-readable licence, e.g. "CC BY-SA 4.0" or "Public domain". */
  license?: string;
  /** Canonical licence deed, e.g. https://creativecommons.org/licenses/by-sa/4.0/ */
  licenseUrl?: string;
  /** Page the image came from (Commons file description page), for the credit link. */
  sourceUrl?: string;
  background?: ImageBackground;
  /**
   * The photo's own background colour, sampled at ingest ("#d4d5d4"), for
   * images shot on a flat ground. The gallery paints the plate this exact
   * value: a fixed class cannot, because one studio grey is not another, and a
   * near miss shows up as a halo in the padding around the image.
   */
  plateColor?: string;
};
