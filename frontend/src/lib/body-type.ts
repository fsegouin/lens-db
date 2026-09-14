/**
 * The vocabulary of cameras.body_type, and the one function every write
 * path runs a label through.
 *
 * body_type answers "what kind of camera is this" at the level a visitor
 * filters on. Two importers had answered it at other levels: DPReview
 * classes digital bodies by size and styling ("Mid-size SLR", "Rangefinder-
 * style mirrorless", "Large sensor compact"), which is cosmetics, and the
 * original lens-db.com import wrote "DSLR" on every digital body, mirrorless
 * and rangefinder included, which is wrong. This folds both into one list:
 *
 * - Digital: DSLR, Mirrorless, Rangefinder (a digital Leica M is a
 *   rangefinder, not a "rangefinder-style" anything), Compact, Bridge and
 *   Digital back.
 * - Film, as camera-wiki categorises them: SLR, TLR, Pseudo TLR,
 *   Rangefinder, Folding, Viewfinder, Press, View, Plate, Stereo, Panoramic,
 *   Subminiature, Instant and Compact.
 *
 * An SLR that is digital is a DSLR, so callers pass whether the body is
 * digital, the same way they do for sensor sizes. A label this file does not
 * recognise passes through trimmed: an admin can still write one, and the
 * list is what the site prefers, not a constraint.
 */

export const BODY_TYPES = {
  digital: ["DSLR", "Mirrorless", "Rangefinder", "Compact", "Bridge", "Digital back"],
  film: [
    "SLR",
    "TLR",
    "Pseudo TLR",
    "Rangefinder",
    "Folding",
    "Viewfinder",
    "Press",
    "View",
    "Plate",
    "Stereo",
    "Panoramic",
    "Subminiature",
    "Instant",
    "Compact",
  ],
} as const;

const KNOWN = new Set<string>([...BODY_TYPES.digital, ...BODY_TYPES.film]);

// Order matters. The digital classes come first so "SLR-style mirrorless"
// never reads as an SLR. The film classes then follow the precedence the
// camera-wiki importer already used ("viewfinder folding" is Folding, a
// "rangefinder folding" camera is a Rangefinder), so existing rows keep
// their label.
const RULES: [RegExp, string][] = [
  [/digital back|medium format back|digital module/i, "Digital back"],
  [/mirrorless|\bmilc\b|\bcsc\b|compact system camera/i, "Mirrorless"],
  [/bridge|slr-like|slr-style|\bzlr\b/i, "Bridge"],
  [/\bd-?slr\b|digital (single[- ]lens[- ]reflex|slr)/i, "DSLR"],
  [/pseudo[- ]?tlr|pseudo twin/i, "Pseudo TLR"],
  [/\btlr\b|twin[- ]lens/i, "TLR"],
  [/\bslr\b|single[- ]lens[- ]reflex/i, "SLR"],
  [/rangefinder/i, "Rangefinder"],
  [/folding|folder/i, "Folding"],
  [/viewfinder|scale[- ]focus|zone[- ]focus/i, "Viewfinder"],
  [/\bpress\b/i, "Press"],
  [/\bview camera\b|^view$|field camera|monorail/i, "View"],
  [/\bplate\b/i, "Plate"],
  [/stereo/i, "Stereo"],
  [/panoram/i, "Panoramic"],
  [/subminiature/i, "Subminiature"],
  [/instant|polaroid|instax/i, "Instant"],
  [/compact|point[- ]and[- ]shoot|point ?& ?shoot/i, "Compact"],
];

function isDigitalFlag(digital: unknown): boolean {
  if (typeof digital === "boolean") return digital;
  return digital != null && digital !== "" && Number.isFinite(Number(digital));
}

/** True when the label is one the site uses, as opposed to one passed through. */
export function isKnownBodyType(label: string | null): boolean {
  return label !== null && KNOWN.has(label);
}

/**
 * A digital body on the Leica M mount focuses with a rangefinder, although
 * DPReview files the M10 and M11 as "Rangefinder-style mirrorless". The M EV1
 * is the exception: it has an electronic finder and no rangefinder.
 */
export function bodyTypeForMount(
  bodyType: string | null,
  systemName: string | null | undefined,
  cameraName: string,
): string | null {
  if (systemName === "Leica M" && bodyType === "Mirrorless" && !/\bM EV1\b/.test(cameraName)) {
    return "Rangefinder";
  }
  return bodyType;
}

/**
 * Whatever wording a form or an importer sends, to the label the site uses.
 * `digital` is either a boolean or the row's megapixels.
 */
export function normalizeBodyType(value: unknown, digital: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const [re, name] of RULES) {
    if (re.test(trimmed)) {
      return name === "SLR" && isDigitalFlag(digital) ? "DSLR" : name;
    }
  }
  return trimmed;
}
