/**
 * Shared image-ingest helpers.
 *
 * Extracted from backfill-commons-images.mjs when a second ingest (mir.com.my)
 * needed the same classification: two copies would drift, and the gallery
 * depends on every image carrying the same background/plateColor vocabulary.
 */

import sharp from "sharp";

// A studio shot on white must sit on a white plate or it glows on the dark
// theme; a cut-out can sit on any plate; a photo in the wild brings its own
// background. The gallery reads this back to pick the plate.
export const BACKGROUND_BONUS = { alpha: 30, white: 18, plain: 8, scene: 0 };

/**
 * Classify what is behind the subject, from the four corners inward.
 * Corners are the cheapest reliable signal: a cut-out has transparent corners,
 * a product shot has four near-white ones, a photo in the wild has neither.
 */
export async function classifyBackground(buffer) {
  const meta = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * info.width + x) * info.channels;

  // Average a small patch in each corner rather than reading one pixel. A
  // studio shot on grey seamless has real lighting falloff, so single pixels
  // read 0xda in one corner and 0xba in another and the ground looks like a
  // scene, which then gets a dark plate and the glowing-rectangle artefact.
  const patch = Math.max(2, Math.round(Math.min(info.width, info.height) * 0.04));
  const corner = (x0, y0) => {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < y0 + patch; y++) {
      for (let x = x0; x < x0 + patch; x++) {
        const i = at(x, y);
        r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
        n++;
      }
    }
    return { r: r / n, g: g / n, b: b / n, a: a / n };
  };
  const corners = [
    corner(0, 0),
    corner(info.width - patch, 0),
    corner(0, info.height - patch),
    corner(info.width - patch, info.height - patch),
  ];

  const hex = (c) =>
    "#" +
    [c.r, c.g, c.b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("");
  const mean = (k) => corners.reduce((sum, c) => sum + c[k], 0) / corners.length;
  const ground = hex({ r: mean("r"), g: mean("g"), b: mean("b") });

  if (meta.hasAlpha && corners.every((c) => c.a < 30)) return { background: "alpha" };
  if (corners.every((c) => c.r > 235 && c.g > 235 && c.b > 235)) {
    return { background: "white", plateColor: ground };
  }
  // A uniform, unsaturated ground (grey seamless, light table) still sits on a
  // light plate. The spread tolerance is wide enough for lighting falloff
  // across the frame, which is routine in a studio shot.
  const spread = (k) => Math.max(...corners.map((c) => c[k])) - Math.min(...corners.map((c) => c[k]));
  const flat = spread("r") < 55 && spread("g") < 55 && spread("b") < 55;
  const grey = corners.every((c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 22);
  const light = corners.every((c) => (c.r + c.g + c.b) / 3 > 150);
  if (flat && grey && light) return { background: "plain", plateColor: ground };
  return { background: "scene" };
}
