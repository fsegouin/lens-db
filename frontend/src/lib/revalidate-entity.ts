import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Make a change to a lens or camera visible on the site.
 *
 * Entity rows are read through `unstable_cache` with month-long lifetimes,
 * so a write that does not clear the tag is a write nobody sees. Every path
 * that writes a lens or camera row calls this; a script that edits by SQL
 * reaches the same code through POST /api/cron/revalidate.
 */
export function revalidateEntity(entityType: "lens" | "camera", slug?: string | null) {
  revalidateTag(entityType === "lens" ? "lenses" : "cameras", "max");
  if (slug) revalidatePath(`${entityType === "lens" ? "/lenses" : "/cameras"}/${slug}`);
}
