import { db } from "@/db";
import { lenses, cameras } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type FieldMapping =
  | { type: "real"; column: string }
  | { type: "integer"; column: string }
  | { type: "text"; column: string }
  | { type: "boolean"; column: string }
  | { type: "specs"; key: string };

// Maps display field name → how to update the DB
const lensFields: Record<string, FieldMapping> = {
  "Maximum Aperture": { type: "real", column: "aperture_min" },
  "Minimum Aperture": { type: "real", column: "aperture_max" },
  Weight: { type: "real", column: "weight_g" },
  "Filter Size": { type: "real", column: "filter_size_mm" },
  "Lens Elements": { type: "integer", column: "lens_elements" },
  "Lens Groups": { type: "integer", column: "lens_groups" },
  "Diaphragm Blades": { type: "integer", column: "diaphragm_blades" },
  "Year Introduced": { type: "integer", column: "year_introduced" },
  "Year Discontinued": { type: "integer", column: "year_discontinued" },
  "Min Focus Distance": { type: "real", column: "min_focus_distance_m" },
  "Max Magnification": { type: "real", column: "max_magnification" },
  Autofocus: { type: "boolean", column: "has_autofocus" },
  Stabilization: { type: "boolean", column: "has_stabilization" },
  "35mm Equiv. Focal Length": {
    type: "specs",
    key: "35mm equivalent focal length",
  },
  Teleconverters: { type: "specs", key: "Teleconverters" },
  "Lens Hood": { type: "specs", key: "Lens hood" },
};

const cameraFields: Record<string, FieldMapping> = {
  "Sensor Size": { type: "text", column: "sensor_size" },
  Megapixels: { type: "real", column: "megapixels" },
  Resolution: { type: "text", column: "resolution" },
  "Year Introduced": { type: "integer", column: "year_introduced" },
  Weight: { type: "real", column: "weight_g" },
  "Body Type": { type: "text", column: "body_type" },
  Type: { type: "specs", key: "Type" },
  Model: { type: "specs", key: "Model" },
  "Film Type": { type: "specs", key: "Film type" },
  "Imaging Sensor": { type: "specs", key: "Imaging sensor" },
  "Crop Factor": { type: "specs", key: "Crop factor" },
  "Image Stabilization": {
    type: "specs",
    key: "Sensor-shift image stabilization",
  },
  Speeds: { type: "specs", key: "Speeds" },
  "Exposure Modes": { type: "specs", key: "Exposure modes" },
  "Exposure Metering": { type: "specs", key: "Exposure metering" },
  Dimensions: { type: "specs", key: "Dimensions" },
};

const fieldMaps: Record<string, Record<string, FieldMapping>> = {
  lens: lensFields,
  camera: cameraFields,
};

/** Strip common display suffixes to get a raw numeric value */
function parseNumeric(value: string): number | null {
  // Remove common suffixes: "g", "mm", "m", "x", " MP", "f/"
  const cleaned = value
    .replace(/^f\//, "")
    .replace(/\s*MP$/i, "")
    .replace(/mm$/, "")
    .replace(/g$/, "")
    .replace(/m$/, "")
    .replace(/x$/, "")
    .trim();
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Apply a user-suggested correction to the database.
 * Returns true if applied, false if the field couldn't be mapped.
 */
export async function applyCorrection(
  entityType: string,
  entityId: number,
  fieldName: string,
  suggestedValue: string
): Promise<boolean> {
  const fieldMap = fieldMaps[entityType];
  if (!fieldMap) return false;

  const mapping = fieldMap[fieldName];
  if (!mapping) return false;

  const table = entityType === "lens" ? lenses : cameras;

  if (mapping.type === "specs") {
    // Update the specs JSON field
    await db
      .update(table)
      .set({
        specs: sql`jsonb_set(COALESCE(${table.specs}, '{}'::jsonb), ${`{${mapping.key}}`}::text[], ${JSON.stringify(suggestedValue)}::jsonb)`,
      })
      .where(eq(table.id, entityId));
    return true;
  }

  // Direct column update
  let dbValue: unknown;
  if (mapping.type === "real" || mapping.type === "integer") {
    const num = parseNumeric(suggestedValue);
    if (num === null) return false;
    dbValue = mapping.type === "integer" ? Math.round(num) : num;
  } else if (mapping.type === "boolean") {
    dbValue = suggestedValue.toLowerCase() === "yes";
  } else {
    dbValue = suggestedValue;
  }

  await db
    .update(table)
    .set({ [mapping.column]: dbValue } as Record<string, unknown>)
    .where(eq(table.id, entityId));
  return true;
}
