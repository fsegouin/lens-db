/**
 * How the two aperture columns are written for a reader.
 *
 * `aperture_min` and `aperture_max` both hold a WIDE-OPEN value: aperture_min
 * at the short end of a zoom, aperture_max at the long end. They are named for
 * the magnitude of the f-number, not the size of the opening, which is the
 * reverse of how a photographer says it — f/4 is the *maximum* aperture of an
 * f/4-5.6 zoom even though 4 is the smaller number.
 *
 * Rendering them as separate "Maximum" and "Minimum Aperture" rows therefore
 * told the reader that f/5.6 was the lens's stopped-down limit. A maker writes
 * one figure, so we do too: "f/4-5.6" for a variable zoom, "f/2.8" for a prime
 * or a constant-aperture zoom.
 *
 * Kept in one place because the same conditional was previously copied into the
 * lens page, the comparison table and the JSON-LD, which is how they came to
 * disagree in the first place.
 */
export function maxApertureLabel(
  apertureMin: number | null | undefined,
  apertureMax: number | null | undefined,
): string | null {
  if (!apertureMin) return null;
  if (apertureMax && apertureMax !== apertureMin) {
    return `f/${apertureMin}-${apertureMax}`;
  }
  return `f/${apertureMin}`;
}
