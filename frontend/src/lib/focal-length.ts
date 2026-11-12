/**
 * A lens's focal length without its unit: "50" for a prime, "24-70" for a
 * zoom, null when unknown. A row holding only the short end reads as that
 * figure alone, not as "50-null".
 */
export function focalRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min) return null;
  return max && max !== min ? `${min}-${max}` : `${min}`;
}
