/**
 * The number an LLM-suggested correction states: the first number in the
 * string, not every digit in it run together ("654 g / 1.4 lb" is 654, not
 * 6541.4). A "1:N" reads as a reproduction ratio on a magnification (1:2 is
 * 0.5) and as f/N on an aperture; on any other field it is no number at all.
 */
export function parseSuggestedNumber(field: string, raw: string): number {
  const text = raw.replace(/(\d),(\d{3})\b/g, "$1$2");
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return NaN;
  // A ratio wherever the first number starts one: "1:2", "1:2 (0.5x)", "Max. 1:4".
  const ratio = text.slice(m.index).match(/^1\s*:\s*(\d+(?:\.\d+)?)/);
  if (ratio) {
    const d = parseFloat(ratio[1]);
    if (field === "maxMagnification") return d > 0 ? 1 / d : NaN;
    if (field === "apertureMin" || field === "apertureMax") return d;
    return NaN;
  }
  return parseFloat(m[0]);
}
