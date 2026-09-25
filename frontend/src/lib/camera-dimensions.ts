/**
 * A camera body's outer size, read from the free-text "Dimensions" spec.
 *
 * The spec is written width x height x depth in almost every record
 * ("146x124x78.5mm", "138 x 98 x 88 mm (5.43 x 3.86 x 3.46″)"), with the
 * separators spelled several ways by the sources the catalogue was built
 * from. Anything that is not a clean triple in millimetres or centimetres
 * reads as unknown rather than as a guess: a size comparison drawn from a
 * misread figure is worse than none.
 *
 * Plain TypeScript with no imports, so maintenance scripts can load it too.
 */

export type CameraDimensions = { widthMm: number; heightMm: number; depthMm: number };

/** The spec keys that hold dimensions, in the order they are trusted. */
export const DIMENSION_SPEC_KEYS = ["Dimensions", "Dimensions, mm", "Size, mm"] as const;

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const TRIPLE = new RegExp(
  String.raw`${NUMBER}\s*(?:mm)?\s*(?:\([WHDL]\))?\s*x\s*${NUMBER}\s*(?:mm)?\s*(?:\([WHDL]\))?\s*x\s*${NUMBER}\s*(?:\([WHDL]\))?\s*(mm|cm)?`,
  "i",
);

// Outside these a figure is a typo or a different unit, not a camera body.
const PLAUSIBLE = { width: [30, 400], height: [20, 300], depth: [12, 300] } as const;

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

export function parseCameraDimensions(raw: string | null | undefined): CameraDimensions | null {
  if (!raw) return null;
  const text = raw.replace(/&times;|×/gi, "x");
  const match = text.match(TRIPLE);
  if (!match) return null;

  // A bare triple with no unit is read as millimetres; the plausibility
  // check below throws it out if that reading makes no sense.
  const scale = match[4]?.toLowerCase() === "cm" ? 10 : 1;
  const [widthMm, heightMm, depthMm] = [match[1], match[2], match[3]].map(
    (n) => Math.round(Number(n.replace(",", ".")) * scale * 10) / 10,
  );

  if (
    !inRange(widthMm, PLAUSIBLE.width) ||
    !inRange(heightMm, PLAUSIBLE.height) ||
    !inRange(depthMm, PLAUSIBLE.depth)
  ) {
    return null;
  }
  return { widthMm, heightMm, depthMm };
}

export function cameraDimensionsFromSpecs(
  specs: Record<string, unknown> | null | undefined,
): CameraDimensions | null {
  if (!specs) return null;
  for (const key of DIMENSION_SPEC_KEYS) {
    const value = specs[key];
    if (typeof value !== "string") continue;
    const parsed = parseCameraDimensions(value);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * The straight-on photo the size comparison draws, stored on
 * `cameras.front_view`. `src` is one of the camera's own images, a cut-out
 * with a transparent ground; `crop` is the camera's outline inside it, in
 * pixels of the `width` x `height` original, so the page can trim the empty
 * margin without a second copy of the file.
 */
export type CameraFrontView = {
  src: string;
  width: number;
  height: number;
  crop: { x: number; y: number; w: number; h: number };
};

export function isCameraFrontView(value: unknown): value is CameraFrontView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const crop = v.crop as Record<string, unknown> | undefined;
  return (
    typeof v.src === "string" &&
    typeof v.width === "number" &&
    typeof v.height === "number" &&
    !!crop &&
    typeof crop.x === "number" &&
    typeof crop.y === "number" &&
    typeof crop.w === "number" &&
    typeof crop.h === "number" &&
    crop.w > 0 &&
    crop.h > 0
  );
}
