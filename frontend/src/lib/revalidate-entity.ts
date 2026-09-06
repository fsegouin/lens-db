import { revalidatePath, revalidateTag } from "next/cache";

export type EntityType = "lens" | "camera";

/**
 * The tag one entity's own cached row is filed under, beside the broad
 * "lenses" / "cameras" tag. Lets a description or image edit refresh that
 * page alone.
 */
export function entityTag(entityType: EntityType, slug: string) {
  return `${entityType}:${slug}`;
}

/**
 * Fields that other pages copy out of a row: list tables, hub pages, brand
 * pages, relations and compare pairs are all cached under the broad tag,
 * and a change to one of these must reach them. Everything else, the
 * description, the specs, the images, is read from the row itself and so
 * from the entity's own tag only.
 */
const listFields: Record<EntityType, ReadonlySet<string>> = {
  lens: new Set([
    "name", "slug", "brand", "systemId", "mergedIntoId", "lensType", "coverage",
    "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax", "weightG",
    "yearIntroduced", "yearDiscontinued", "isZoom", "isPrime", "isMacro",
    "hasAutofocus", "hasStabilization", "productionStatus", "era",
  ]),
  camera: new Set([
    "name", "slug", "systemId", "builtInLensId", "mergedIntoId", "alias",
    "sensorType", "sensorSize", "megapixels", "bodyType", "weightG",
    "yearIntroduced", "yearDiscontinued",
  ]),
};

/** Whether an edit to these fields is visible anywhere but the entity's own page. */
export function touchesLists(entityType: EntityType, fields: Iterable<string>) {
  for (const field of fields) if (listFields[entityType].has(field)) return true;
  return false;
}

/**
 * Make a change to a lens or camera visible on the site.
 *
 * Entity rows are read through `unstable_cache` with month-long lifetimes,
 * so a write that does not clear a tag is a write nobody sees. Every path
 * that writes a lens or camera row calls this; a script that edits by SQL
 * reaches the same code through POST /api/cron/revalidate.
 *
 * The broad tag hangs off every cached list, hub, brand page, relation and
 * compare pair as well as every row, so clearing it empties the whole
 * site's data cache and the next crawl re-renders the catalogue from
 * Postgres. That is what turned a week of admin edits into gigabytes of
 * database egress. Pass `scope: "row"` when only fields nobody else reads
 * changed (see `touchesLists`), and the entity's own row and page refresh
 * while everything else stays cached.
 */
export function revalidateEntity(
  entityType: EntityType,
  slug?: string | null,
  scope: "row" | "lists" = "lists",
) {
  if (slug) {
    revalidateTag(entityTag(entityType, slug), "max");
    revalidatePath(`${entityType === "lens" ? "/lenses" : "/cameras"}/${slug}`);
  }
  if (scope === "lists" || !slug) {
    revalidateTag(entityType === "lens" ? "lenses" : "cameras", "max");
  }
}
