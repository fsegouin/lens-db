/**
 * The vocabularies of cameras.shutter_type and cameras.shutter_control, and
 * the functions every write path runs a value through.
 *
 * They answer two different questions. The type is the mechanism: where the
 * shutter sits and how it moves (a focal-plane curtain, a leaf in the lens).
 * The control is how its speeds are timed. A Canon EF has a focal-plane
 * shutter with hybrid control: its fast speeds are timed mechanically and
 * work without a battery, its slow ones are timed electronically. Treating
 * "Hybrid" as a kind of shutter would have made the EF stop being a
 * focal-plane camera.
 *
 * Both lists are closed. A value neither normaliser can place comes back as
 * null so it is never written: shutter_control is filtered with exact
 * equality on /cameras, and a stray spelling is a filter that matches nothing.
 */

export const SHUTTER_TYPES = [
  "Focal-plane",
  // A leaf shutter built into the body's own lens.
  "Leaf",
  // A leaf shutter in every interchangeable lens, as on Hasselblad V or
  // Bronica ETR bodies.
  "In-lens leaf",
  "Rotary",
  // A single plate that drops across the aperture, on early box cameras.
  "Guillotine",
  // A digital body with no mechanical shutter, timed by the sensor readout.
  "Electronic (sensor)",
] as const;

export const SHUTTER_CONTROLS = ["Mechanical", "Electronically controlled", "Hybrid"] as const;

export type ShutterType = (typeof SHUTTER_TYPES)[number];
export type ShutterControl = (typeof SHUTTER_CONTROLS)[number];

// Order matters: "in-lens leaf" before "leaf", and "electronic" only when
// nothing names a mechanism, because "electronically controlled focal-plane
// shutter" is a focal-plane shutter.
const TYPE_RULES: [RegExp, ShutterType][] = [
  [/focal[- ]?plane/i, "Focal-plane"],
  // The Copal Square is a metal-bladed focal-plane unit, not one of Copal's
  // leaf shutters, and "blade shutter" below would otherwise call it a leaf.
  [/\bcopal[- ]square\b/i, "Focal-plane"],
  // "Leaf shutter in the lens" describes any fixed-lens compact, so only
  // "each" or "every" lens means one shutter per interchangeable lens.
  [/in[- ]lens leaf|leaf[^,;]*\bin (each|every) lens/i, "In-lens leaf"],
  [/\bleaf\b|between[- ]the[- ]lens|\bcentral shutter|\bblade shutter/i, "Leaf"],
  [/\brotary\b|\bsector shutter/i, "Rotary"],
  [/\bguillotine\b/i, "Guillotine"],
  [/^electronic( shutter)?( \(sensor\))?$|\bsensor\b|global shutter|rolling shutter/i, "Electronic (sensor)"],
];

/** Whatever wording a form or an importer sends, to the label the site uses, or null. */
export function normalizeShutterType(value: unknown): ShutterType | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const [re, label] of TYPE_RULES) {
    if (re.test(trimmed)) return label;
  }
  return null;
}

/** Whatever wording a form or an importer sends, to the label the site uses, or null. */
export function normalizeShutterControl(value: unknown): ShutterControl | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/hybrid/i.test(v)) return "Hybrid";
  if (/^mechanical/i.test(v)) return "Mechanical";
  if (/^electronic/i.test(v)) return "Electronically controlled";
  return null;
}

/**
 * The shutter unit's name, when the imported "Model" spec carries one after
 * its control ("Mechanical Copal Square" names a Copal Square). The control
 * itself now has a column, so only the unit is left for this spec to say.
 */
export function shutterUnit(model: string | null | undefined): string | null {
  if (!model) return null;
  const unit = model
    .trim()
    .replace(/^(mechanical|electronically controlled|electronic|hybrid)\b/i, "")
    .trim();
  return unit && unit !== model.trim() ? unit : null;
}
