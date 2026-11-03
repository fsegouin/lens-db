import {
  COVERAGE,
  ERA,
  PRODUCTION_STATUS,
  normalizeCoverage,
  normalizeEra,
  normalizeLensType,
  normalizeProductionStatus,
} from "./vocabularies.ts";
import {
  SHUTTER_CONTROLS,
  SHUTTER_TYPES,
  normalizeShutterControl,
  normalizeShutterType,
} from "./shutter.ts";

// The words a form shows for each controlled field, and the values it takes.
// Lens type is an open taxonomy, so it lists none.
const CONTROLLED_FIELDS: Record<string, { label: string; allowed?: readonly string[] }> = {
  coverage: { label: "coverage", allowed: COVERAGE },
  era: { label: "era", allowed: ERA },
  productionStatus: { label: "production status", allowed: PRODUCTION_STATUS },
  lensType: { label: "lens type" },
  shutterType: { label: "shutter type", allowed: SHUTTER_TYPES },
  shutterControl: { label: "shutter control", allowed: SHUTTER_CONTROLS },
};

/** The message a form shows when normalizeControlledValue refuses a value. */
export function refusedValueMessage(field: string, value: unknown): string {
  const known = Object.hasOwn(CONTROLLED_FIELDS, field) ? CONTROLLED_FIELDS[field] : undefined;
  const shown = typeof value === "string" ? `"${value}"` : "That value";
  const message = `${shown} is not a recognised ${known?.label ?? field}`;
  return known?.allowed ? `${message}. Use one of: ${known.allowed.join(", ")}.` : `${message}.`;
}

/**
 * Puts a proposed value into its controlled vocabulary, or refuses it.
 *
 * A field allowlist checks which field may be written, never what may go in
 * it, so approving an edit once wrote whatever string it carried. These
 * columns are filtered with exact equality, and `coverage` had already reached
 * 17 spellings for six concepts once before: the Medium Format filter matched
 * nothing at all because every such lens was recorded with a capital F.
 *
 * An edit does not have to be malicious to do that. The DPReview spec audit
 * proposed the raw table's "Four Thirds" over a stored "micro-four-thirds"
 * that already means the same thing.
 *
 * Returns `undefined` for a field with no vocabulary, or for null (clearing
 * the field), both written unchanged; the label for a value that maps; and
 * `null` for one that does not (refuse or drop it). A number or an object in
 * a controlled field is refused too: a request body is not typed.
 */
export function normalizeControlledValue(field: string, value: unknown): string | null | undefined {
  if (value == null) return undefined;
  switch (field) {
    case "coverage":
      return normalizeCoverage(value);
    case "era":
      return normalizeEra(value);
    case "productionStatus":
      return normalizeProductionStatus(value);
    case "lensType":
      return normalizeLensType(value);
    case "shutterType":
      return normalizeShutterType(value);
    case "shutterControl":
      return normalizeShutterControl(value);
    default:
      return undefined;
  }
}
