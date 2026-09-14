/**
 * The name of the 35mm-sized format, which the catalogue spells two ways on
 * purpose: "35mm" for film bodies and "Full frame" for sensors. "Full frame"
 * is a digital-era term that means "a sensor the size of a 35mm frame", so
 * a film camera is simply a 35mm camera.
 *
 * Until September 2026 two importers disagreed, and 171 digital bodies sat
 * under the film label "35mm full frame" while later ones got "Full frame".
 * This turns whatever wording a form or an importer sends into the right
 * one of the two, so the split cannot come back through an edit. Any other
 * label ("APS-C", "Medium format 6x6") passes through untouched.
 */
export function normalizeSensorSize(
  value: unknown,
  megapixels: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isDigital = megapixels != null && megapixels !== "" && Number.isFinite(Number(megapixels));
  if (/^(35\s*mm\s+)?full[\s-]*frame$/i.test(trimmed)) {
    return isDigital ? "Full frame" : "35mm";
  }
  if (/^35\s*mm(\s+film)?$/i.test(trimmed)) return isDigital ? "Full frame" : "35mm";
  return trimmed;
}
