import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { isCronAuthorized } from "@/lib/api-utils";

/**
 * Bust caches after a change made outside the app.
 *
 * Entity rows are read through `unstable_cache` with month-long lifetimes,
 * and that cache survives deployments. A description edited by a script is
 * therefore invisible on the site until its tag is revalidated, which only
 * the admin edit form used to do. Maintenance scripts call this instead.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        -H "Content-Type: application/json" \
 *        -d '{"tags":["lenses"],"paths":["/lenses/some-slug"]}' \
 *        https://thelensdb.com/api/cron/revalidate
 */

const KNOWN_TAGS = new Set(["lenses", "cameras", "kit"]);

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tags?: unknown; paths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [];
  const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === "string") : [];
  const unknownTag = tags.find((t) => !KNOWN_TAGS.has(t));
  if (unknownTag) {
    return NextResponse.json({ error: `Unknown tag: ${unknownTag}` }, { status: 400 });
  }
  const badPath = paths.find((p) => !p.startsWith("/"));
  if (badPath) {
    return NextResponse.json({ error: `Path must start with /: ${badPath}` }, { status: 400 });
  }
  if (tags.length === 0 && paths.length === 0) {
    return NextResponse.json({ error: "Nothing to revalidate" }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag, "max");
  for (const path of paths) revalidatePath(path);
  return NextResponse.json({ revalidated: { tags, paths } });
}
