import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { requireAdminAPI, getAdminUserFromToken } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { eq, sql } from "drizzle-orm";

/**
 * Merge one collection into another, then delete the loser.
 *
 * The imported collections contain nine duplicate pairs across two naming
 * conventions, and doing this by hand through CollectionLensManager means one
 * click per lens, each click a full delete-and-reinsert of the membership
 * list. This does it in a single transaction instead.
 *
 * What has to happen in that transaction, in this order:
 *
 *  - Memberships move first, ignoring ones the target already has.
 *  - Redirects already pointing at the source are re-pointed at the target
 *    BEFORE the delete. collection_redirects cascades on collection_id, so
 *    deleting the source first would silently destroy them and break a chain
 *    of merges. Doing it here also keeps every chain one hop long.
 *  - The source's own slug becomes a redirect to the target.
 *  - revisions, pending_edits and issue_reports address entities
 *    polymorphically with no foreign key, so nothing cascades and they would
 *    be left pointing at an id that no longer exists. They move to the target.
 *    Revisions have a unique on (entity_type, entity_id, revision_number), so
 *    the source's numbers are offset past the target's highest rather than
 *    colliding.
 *  - Only then is the source deleted, taking its now-empty membership rows.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  const body = await request.json().catch(() => ({}));
  const intoId = body?.intoId;

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });
  }
  if (!Number.isInteger(intoId)) {
    return NextResponse.json({ error: "intoId must be an integer" }, { status: 400 });
  }
  if (sourceId === intoId) {
    return NextResponse.json({ error: "A collection cannot be merged into itself" }, { status: 400 });
  }

  const admin = await getAdminUserFromToken(token);

  const rows = await db
    .select({ id: collections.id, name: collections.name, slug: collections.slug })
    .from(collections)
    .where(sql`${collections.id} IN (${sourceId}, ${intoId})`);

  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === intoId);
  if (!source) return NextResponse.json({ error: "Source collection not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target collection not found" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    const moved = await tx.execute(sql`
      INSERT INTO lens_collections (lens_id, collection_id)
      SELECT lens_id, ${intoId} FROM lens_collections WHERE collection_id = ${sourceId}
      ON CONFLICT DO NOTHING
    `);

    await tx.execute(sql`
      UPDATE collection_redirects SET collection_id = ${intoId} WHERE collection_id = ${sourceId}
    `);

    await tx.execute(sql`
      INSERT INTO collection_redirects (old_slug, collection_id)
      VALUES (${source.slug}, ${intoId})
      ON CONFLICT (old_slug) DO UPDATE SET collection_id = ${intoId}
    `);

    // Offset past the target's highest revision number so the unique constraint
    // holds and the merged history reads in order.
    //
    // The snapshot in `data` also has to be re-identified. revertToRevision
    // strips only id, createdAt and protectionLevel before writing the rest
    // back onto entity_id, so a moved revision that kept the source's name and
    // slug would, on revert, rename the survivor to the collection that was
    // merged away and hand it a slug that is now a redirect, leaving the
    // survivor's own URL a 404. Only the identity is rewritten; the historical
    // description is what makes the revision worth keeping.
    await tx.execute(sql`
      UPDATE revisions SET
        entity_id = ${intoId},
        revision_number = revision_number + COALESCE(
          (SELECT MAX(revision_number) FROM revisions
            WHERE entity_type = 'collection' AND entity_id = ${intoId}), 0),
        data = jsonb_set(
                 jsonb_set(
                   jsonb_set(data, '{id}', to_jsonb(${intoId}::int)),
                   '{slug}', to_jsonb(${target.slug}::text)),
                 '{name}', to_jsonb(${target.name}::text))
      WHERE entity_type = 'collection' AND entity_id = ${sourceId}
    `);

    // A pending edit proposing a new name or description for the source is not
    // a proposal about the survivor, and approving it after the move would
    // rename the wrong collection. Reject them, then re-point so the audit
    // trail does not dangle.
    const rejected = await tx.execute(sql`
      UPDATE pending_edits
      SET status = 'rejected',
          reject_reason = ${`Collection "${source.name}" was merged into "${target.name}"`},
          reviewed_at = now()
      WHERE entity_type = 'collection' AND entity_id = ${sourceId} AND status = 'pending'
    `);

    await tx.execute(sql`
      UPDATE pending_edits SET entity_id = ${intoId}
      WHERE entity_type = 'collection' AND entity_id = ${sourceId}
    `);

    await tx.execute(sql`
      UPDATE issue_reports
      SET entity_id = ${intoId}, entity_slug = ${target.slug}, entity_name = ${target.name}
      WHERE entity_type = 'collection' AND entity_id = ${sourceId}
    `);

    await tx.delete(collections).where(eq(collections.id, sourceId));

    // Counted the way every other surface counts, over live lens rows, so the
    // number returned here matches what the admin list and the public page
    // will show rather than disagreeing with both.
    const [{ total }] = (await tx.execute(sql`
      SELECT count(l.id)::int AS total
      FROM lens_collections lc
      JOIN lenses l ON l.id = lc.lens_id AND l.merged_into_id IS NULL
      WHERE lc.collection_id = ${intoId}
    `)).rows as { total: number }[];

    return {
      movedRows: moved.rowCount ?? 0,
      targetTotal: total,
      rejectedEdits: rejected.rowCount ?? 0,
    };
  });

  // A merge changes the collection badges on every member lens page, which
  // getLensRelations caches for 30 days, and the index, which caches for 7.
  // Without this the survivor's own page would update and everything pointing
  // at it would keep the old shape.
  revalidateTag("lenses", "max");
  revalidatePath("/collections");
  revalidatePath(`/collections/${target.slug}`);
  revalidatePath(`/collections/${source.slug}`);

  // The merge is already committed. A failure to write its log entry must not
  // report the whole thing as failed, or the operator retries and gets a 404
  // for a source that is legitimately gone.
  let revisionWarning: string | undefined;
  try {
    await createRevision({
      entityType: "collection",
      entityId: intoId,
      userId: admin!.id,
      summary: `Merged "${source.name}" (${source.slug}) into this collection`,
      autoPatrol: true,
    });
  } catch (err) {
    revisionWarning = `Merge succeeded but the revision log entry failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    console.error("[collections/merge] revision write failed", err);
  }

  return NextResponse.json({
    success: true,
    merged: { id: source.id, name: source.name, slug: source.slug },
    into: { id: target.id, name: target.name, slug: target.slug },
    membershipsMoved: result.movedRows,
    targetLensCount: result.targetTotal,
    rejectedPendingEdits: result.rejectedEdits,
    ...(revisionWarning ? { warning: revisionWarning } : {}),
  });
}
