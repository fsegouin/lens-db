/**
 * The imported specs blob carries thousands of placeholder strings standing in
 * for missing data: "<No information>", "<No data>", "Not available for your
 * region", lone dashes, empty strings. Rendering those as if they were facts
 * makes the record look wrong rather than incomplete, so they are treated as
 * absent everywhere a spec is displayed.
 */
const PLACEHOLDER = /^(?:<\s*no\s+(?:information|data)\s*>|n\s*\/\s*a|not\s+available.*|none\s+specified|unknown|-{1,3}|—|\.)$/i;

export function specValue(
  value: string | number | null | undefined,
): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (trimmed === "" || PLACEHOLDER.test(trimmed)) return null;
  return trimmed;
}
