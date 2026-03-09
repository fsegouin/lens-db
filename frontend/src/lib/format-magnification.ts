export function formatMagnification(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "\u2014";
  }

  if (value < 1) {
    const ratio = 1 / value;
    const rounded = ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
    const clean = rounded.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    return `1:${clean}`;
  }

  const rounded = value.toFixed(2);
  const clean = rounded.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return `${clean}x`;
}
