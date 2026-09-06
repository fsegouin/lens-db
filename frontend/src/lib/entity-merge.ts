/**
 * Field-level merge of two records that turned out to be the same product.
 *
 * Confirming a duplicate used to do one thing: stamp the loser with
 * `mergedIntoId` so its URL redirects to the keeper. Everything the loser knew
 * that the keeper did not (a weight, a spec block, a photo, a source URL)
 * stayed stranded on a row nobody would open again. A merge should be able to
 * carry that across, and the reviewer, not a rule, decides what comes over.
 *
 * The vocabulary here is the one field_citations already uses: a plain column
 * is addressed by its schema key ("weightG"), one key of the specs block by
 * "specs.<Key>", and the whole photo list by "images". Taking "images" appends
 * the loser's photos that the keeper does not already have, by URL.
 *
 * Pure, so it can be unit-tested and the route stays a thin shell around it.
 */

export type MergeEntityType = "lens" | "camera";

export type MergeField = {
  key: string;
  label: string;
  /** Long text renders differently from a short scalar in the review table. */
  kind: "text" | "longtext" | "number" | "boolean" | "ref";
};

export const IMAGES_KEY = "images";
export const SPECS_PREFIX = "specs.";

// Columns a reviewer may pull from the loser. Deliberately absent: id, slug
// (the keeper's URL must not move), verified, protection, engagement counters,
// mergedIntoId, createdAt and relational lineage (versionGroupId), which is a
// separate decision from "these two are one product".
export const MERGE_FIELDS: Record<MergeEntityType, MergeField[]> = {
  camera: [
    { key: "name", label: "Name", kind: "text" },
    { key: "alias", label: "Alias", kind: "text" },
    { key: "url", label: "Source URL", kind: "text" },
    { key: "systemId", label: "Mount system", kind: "ref" },
    { key: "builtInLensId", label: "Built-in lens", kind: "ref" },
    { key: "description", label: "Description", kind: "longtext" },
    { key: "bodyType", label: "Body type", kind: "text" },
    { key: "shutterType", label: "Shutter", kind: "text" },
    { key: "sensorType", label: "Sensor type", kind: "text" },
    { key: "sensorSize", label: "Sensor / format", kind: "text" },
    { key: "megapixels", label: "Megapixels", kind: "number" },
    { key: "resolution", label: "Resolution", kind: "text" },
    { key: "yearIntroduced", label: "Year introduced", kind: "number" },
    { key: "weightG", label: "Weight (g)", kind: "number" },
  ],
  lens: [
    { key: "name", label: "Name", kind: "text" },
    { key: "url", label: "Source URL", kind: "text" },
    { key: "brand", label: "Brand", kind: "text" },
    { key: "systemId", label: "Mount system", kind: "ref" },
    { key: "description", label: "Description", kind: "longtext" },
    { key: "lensType", label: "Lens type", kind: "text" },
    { key: "era", label: "Era", kind: "text" },
    { key: "productionStatus", label: "Production status", kind: "text" },
    { key: "coverage", label: "Coverage", kind: "text" },
    { key: "versionLabel", label: "Version label", kind: "text" },
    { key: "focalLengthMin", label: "Focal length min", kind: "number" },
    { key: "focalLengthMax", label: "Focal length max", kind: "number" },
    { key: "apertureMin", label: "Max aperture (f/)", kind: "number" },
    { key: "apertureMax", label: "Min aperture (f/)", kind: "number" },
    { key: "weightG", label: "Weight (g)", kind: "number" },
    { key: "filterSizeMm", label: "Filter size (mm)", kind: "number" },
    { key: "minFocusDistanceM", label: "Min focus (m)", kind: "number" },
    { key: "maxMagnification", label: "Max magnification", kind: "number" },
    { key: "lensElements", label: "Elements", kind: "number" },
    { key: "lensGroups", label: "Groups", kind: "number" },
    { key: "diaphragmBlades", label: "Diaphragm blades", kind: "number" },
    { key: "yearIntroduced", label: "Year introduced", kind: "number" },
    { key: "yearDiscontinued", label: "Year discontinued", kind: "number" },
    { key: "isZoom", label: "Zoom", kind: "boolean" },
    { key: "isPrime", label: "Prime", kind: "boolean" },
    { key: "isMacro", label: "Macro", kind: "boolean" },
    { key: "hasAutofocus", label: "Autofocus", kind: "boolean" },
    { key: "hasStabilization", label: "Stabilisation", kind: "boolean" },
  ],
};

export type EntityRecord = Record<string, unknown> & {
  specs?: unknown;
  images?: unknown;
};

export type ImageEntry = { src: string } & Record<string, unknown>;

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export function specsOf(record: EntityRecord): Record<string, unknown> {
  const specs = record.specs;
  return specs && typeof specs === "object" && !Array.isArray(specs)
    ? (specs as Record<string, unknown>)
    : {};
}

export function imagesOf(record: EntityRecord): ImageEntry[] {
  const images = record.images;
  return Array.isArray(images)
    ? images.filter(
        (img): img is ImageEntry =>
          !!img && typeof img === "object" && typeof (img as ImageEntry).src === "string",
      )
    : [];
}

/**
 * What taking a plain column from the loser would put on the keeper.
 *
 * One column is not a straight copy: a camera's alias is its other name, and
 * the name the retired record went by is exactly that. When the loser has no
 * alias of its own, its name is offered instead, so a merge of "Contax 139"
 * into "Contax 139 Quartz" can keep both names searchable. If the reviewer is
 * also taking the loser's name, the keeper's own name is the one about to be
 * lost, so that is what the alias row offers.
 */
export function takeValue(
  entityType: MergeEntityType,
  key: string,
  keeper: EntityRecord,
  loser: EntityRecord,
  take: readonly string[] = [],
): unknown {
  if (entityType === "camera" && key === "alias" && isEmptyValue(loser.alias)) {
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const nameTaken = take.includes("name") && !isEmptyValue(loser.name);
    const finalName = nameTaken ? str(loser.name) : str(keeper.name);
    const offered = nameTaken ? str(keeper.name) : str(loser.name);
    if (offered && offered !== finalName && offered !== str(keeper.alias)) return offered;
    return null;
  }
  return loser[key];
}

/** Every key a reviewer could take for this pair, in review order. */
export function mergeableKeys(
  entityType: MergeEntityType,
  keeper: EntityRecord,
  loser: EntityRecord,
): string[] {
  const keys = MERGE_FIELDS[entityType].map((f) => f.key);
  const specKeys = new Set<string>([
    ...Object.keys(specsOf(keeper)),
    ...Object.keys(specsOf(loser)),
  ]);
  for (const key of specKeys) keys.push(SPECS_PREFIX + key);
  keys.push(IMAGES_KEY);
  return keys;
}

/** The loser's photos the keeper does not already have, matched by URL. */
export function newImages(keeper: EntityRecord, loser: EntityRecord): ImageEntry[] {
  const have = new Set(imagesOf(keeper).map((img) => img.src));
  return imagesOf(loser).filter((img) => !have.has(img.src));
}

/**
 * The default pick, which a reviewer then adjusts: bring over what the keeper
 * is missing and nothing the keeper already has. Unlike a blind "take all"
 * this never overwrites a curated value with a scraped one, and unlike "take
 * nothing" it does the obvious backfill without a click per field.
 */
export function defaultTake(
  entityType: MergeEntityType,
  keeper: EntityRecord,
  loser: EntityRecord,
): string[] {
  const take: string[] = [];
  for (const { key } of MERGE_FIELDS[entityType]) {
    if (isEmptyValue(keeper[key]) && !isEmptyValue(takeValue(entityType, key, keeper, loser))) {
      take.push(key);
    }
  }
  const keeperSpecs = specsOf(keeper);
  const loserSpecs = specsOf(loser);
  for (const key of Object.keys(loserSpecs)) {
    if (isEmptyValue(keeperSpecs[key]) && !isEmptyValue(loserSpecs[key])) {
      take.push(SPECS_PREFIX + key);
    }
  }
  if (newImages(keeper, loser).length > 0) take.push(IMAGES_KEY);
  return take;
}

/**
 * Compute the column updates that taking `take` from the loser produces.
 * Returns only what changes, so an empty result means nothing to write.
 * Unknown keys are ignored rather than trusted: the client may only pick from
 * mergeableKeys().
 */
export function applyTake(
  entityType: MergeEntityType,
  keeper: EntityRecord,
  loser: EntityRecord,
  take: string[],
): { updates: Record<string, unknown>; taken: string[] } {
  const allowed = new Set(mergeableKeys(entityType, keeper, loser));
  const updates: Record<string, unknown> = {};
  const taken: string[] = [];
  let specs: Record<string, unknown> | null = null;

  for (const key of take) {
    if (!allowed.has(key)) continue;
    if (key === IMAGES_KEY) {
      const extra = newImages(keeper, loser);
      if (extra.length === 0) continue;
      updates.images = [...imagesOf(keeper), ...extra];
      taken.push(key);
    } else if (key.startsWith(SPECS_PREFIX)) {
      const specKey = key.slice(SPECS_PREFIX.length);
      const value = specsOf(loser)[specKey];
      if (isEmptyValue(value)) continue;
      if (JSON.stringify(specsOf(keeper)[specKey] ?? null) === JSON.stringify(value)) continue;
      specs ??= { ...specsOf(keeper) };
      specs[specKey] = value;
      taken.push(key);
    } else {
      const value = takeValue(entityType, key, keeper, loser, take);
      if (isEmptyValue(value)) continue;
      if (JSON.stringify(keeper[key] ?? null) === JSON.stringify(value)) continue;
      updates[key] = value;
      taken.push(key);
    }
  }
  if (specs) updates.specs = specs;
  return { updates, taken };
}

/** A one-line, human edit summary for the keeper's revision. */
export function mergeSummary(loserName: string, loserId: number, taken: string[]): string {
  const base = `Merged duplicate "${loserName}" (#${loserId})`;
  if (taken.length === 0) return base + ", kept every field as it was";
  const shown = taken.slice(0, 8).join(", ");
  const more = taken.length > 8 ? ` and ${taken.length - 8} more` : "";
  return `${base}, took ${shown}${more}`;
}
