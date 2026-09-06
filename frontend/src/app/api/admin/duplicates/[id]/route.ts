import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  collections,
  duplicateFlags,
  lensCollections,
  lenses,
  cameras,
  systems,
} from "@/db/schema";
import { requireAdminAPI, getAdminUserFromToken } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { getCitations } from "@/lib/citations";
import {
  applyTake,
  defaultTake,
  mergeSummary,
  type EntityRecord,
  type MergeEntityType,
} from "@/lib/entity-merge";
import { eq, inArray, sql } from "drizzle-orm";

async function loadFlag(id: string) {
  const flagId = parseInt(id, 10);
  if (!Number.isFinite(flagId)) return null;
  const [flag] = await db
    .select()
    .from(duplicateFlags)
    .where(eq(duplicateFlags.id, flagId))
    .limit(1);
  return flag ?? null;
}

function entityTypeOf(flag: { sourceEntityType: string }): MergeEntityType {
  return flag.sourceEntityType === "lens" ? "lens" : "camera";
}

/**
 * Both records of a flagged pair, side by side, with what is known about
 * where each field came from. This is what the review screen renders; the
 * reviewer picks per field what the keeper takes from the other row.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const flag = await loadFlag(id);
  if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

  const entityType = entityTypeOf(flag);
  const table = entityType === "lens" ? lenses : cameras;
  const rows = await db
    .select()
    .from(table)
    .where(inArray(table.id, [flag.sourceEntityId, flag.targetEntityId]));
  const source = rows.find((r) => r.id === flag.sourceEntityId) as EntityRecord | undefined;
  const target = rows.find((r) => r.id === flag.targetEntityId) as EntityRecord | undefined;
  if (!source || !target) {
    return NextResponse.json({ error: "One of the flagged records no longer exists" }, { status: 404 });
  }

  const [sourceCitations, targetCitations] = await Promise.all([
    getCitations(entityType, flag.sourceEntityId),
    getCitations(entityType, flag.targetEntityId),
  ]);

  // Foreign keys read as names on screen.
  const systemIds = [source.systemId, target.systemId].filter(
    (v): v is number => typeof v === "number",
  );
  const lensIds = [source.builtInLensId, target.builtInLensId].filter(
    (v): v is number => typeof v === "number",
  );
  const [systemRows, lensRows] = await Promise.all([
    systemIds.length
      ? db.select({ id: systems.id, name: systems.name }).from(systems).where(inArray(systems.id, systemIds))
      : Promise.resolve([]),
    lensIds.length
      ? db.select({ id: lenses.id, name: lenses.name }).from(lenses).where(inArray(lenses.id, lensIds))
      : Promise.resolve([]),
  ]);

  const citationsToJson = (m: Map<string, { sourceName: string; sourceUrl: string | null }>) =>
    Object.fromEntries([...m].map(([k, v]) => [k, { sourceName: v.sourceName, sourceUrl: v.sourceUrl }]));

  return NextResponse.json({
    flag,
    entityType,
    source: { record: source, citations: citationsToJson(sourceCitations) },
    target: { record: target, citations: citationsToJson(targetCitations) },
    refs: {
      systems: Object.fromEntries(systemRows.map((r) => [r.id, r.name])),
      lenses: Object.fromEntries(lensRows.map((r) => [r.id, r.name])),
    },
  });
}

/**
 * Resolve a flag.
 *
 * `dismiss` records that the two are not the same product.
 *
 * `confirm` merges. The keeper takes the fields listed in `take` from the
 * loser (see entity-merge.ts for the vocabulary), inherits the loser's
 * memberships, ratings and kit entries, and the loser is retired behind a
 * redirect. Nothing is deleted: the loser row stays so its URL keeps
 * resolving, and nulling merged_into_id undoes the retirement. Both rows get
 * a revision so the merge shows up in history and recent changes.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;
  const admin = await getAdminUserFromToken(token);

  const { id } = await params;
  const body = await request.json();
  const { action, keepEntityId, take } = body as {
    action: "confirm" | "dismiss";
    keepEntityId?: number;
    /** Keys from mergeableKeys(). Absent means the default backfill. */
    take?: string[];
  };

  const flag = await loadFlag(id);
  if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  if (flag.status !== "pending") {
    return NextResponse.json({ error: `Flag is already ${flag.status}` }, { status: 409 });
  }

  if (action === "dismiss") {
    await db
      .update(duplicateFlags)
      .set({ status: "dismissed", resolvedAt: new Date(), resolvedByUserId: admin?.id ?? null })
      .where(eq(duplicateFlags.id, flag.id));
    return NextResponse.json({ success: true });
  }

  if (action !== "confirm") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (keepEntityId !== flag.sourceEntityId && keepEntityId !== flag.targetEntityId) {
    return NextResponse.json(
      { error: "keepEntityId must be one of the flagged entities" },
      { status: 400 }
    );
  }
  if (take !== undefined && !(Array.isArray(take) && take.every((k) => typeof k === "string"))) {
    return NextResponse.json({ error: "take must be a list of field keys" }, { status: 400 });
  }

  const keepId = keepEntityId;
  const mergeId = keepId === flag.sourceEntityId ? flag.targetEntityId : flag.sourceEntityId;
  const entityType = entityTypeOf(flag);
  const table = entityType === "lens" ? lenses : cameras;

  const rows = await db.select().from(table).where(inArray(table.id, [keepId, mergeId]));
  const keeper = rows.find((r) => r.id === keepId) as EntityRecord | undefined;
  const loser = rows.find((r) => r.id === mergeId) as EntityRecord | undefined;
  if (!keeper || !loser) {
    return NextResponse.json({ error: "One of the flagged records no longer exists" }, { status: 404 });
  }
  if (typeof keeper.mergedIntoId === "number") {
    return NextResponse.json(
      { error: "The keeper is itself merged into another record; keep the other one or undo that merge first" },
      { status: 409 }
    );
  }

  const { updates, taken } = applyTake(
    entityType,
    keeper,
    loser,
    take ?? defaultTake(entityType, keeper, loser),
  );

  const stats = await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(table).set(updates).where(eq(table.id, keepId));
    }

    // Provenance travels with the value: a field taken from the loser keeps
    // the loser's citation, and the keeper's own citation for that field is
    // dropped either way, since it vouched for a value that is no longer there.
    if (taken.length > 0) {
      // A JS array interpolated into sql`` becomes a row tuple, not a text[],
      // so build the IN list one bound parameter at a time.
      const takenList = sql.join(
        taken.map((field) => sql`${field}`),
        sql`, `,
      );
      await tx.execute(sql`
        DELETE FROM field_citations
        WHERE entity_type = ${entityType} AND entity_id = ${keepId} AND field IN (${takenList})
      `);
      await tx.execute(sql`
        INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, retrieved_at, note)
        SELECT entity_type, ${keepId}, field, source_name, source_url, retrieved_at, note
        FROM field_citations
        WHERE entity_type = ${entityType} AND entity_id = ${mergeId} AND field IN (${takenList})
        ON CONFLICT (entity_type, entity_id, field) DO NOTHING
      `);
    }

    // Memberships and relations the loser has and the keeper lacks.
    let ratingsMoved = 0;
    if (entityType === "lens") {
      await tx.execute(sql`INSERT INTO lens_collections (lens_id, collection_id)
        SELECT ${keepId}, collection_id FROM lens_collections WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO lens_series_memberships (lens_id, series_id)
        SELECT ${keepId}, series_id FROM lens_series_memberships WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO lens_tags (lens_id, tag_id)
        SELECT ${keepId}, tag_id FROM lens_tags WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO lens_systems (lens_id, system_id)
        SELECT ${keepId}, system_id FROM lens_systems WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO lens_compatibility (lens_id, camera_id, is_native, notes)
        SELECT ${keepId}, camera_id, is_native, notes FROM lens_compatibility WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING`);
      const moved = await tx.execute(sql`INSERT INTO lens_ratings (lens_id, ip_hash, rating, created_at)
        SELECT ${keepId}, ip_hash, rating, created_at FROM lens_ratings WHERE lens_id = ${mergeId} ON CONFLICT DO NOTHING RETURNING id`);
      ratingsMoved = moved.rowCount ?? 0;
      if (ratingsMoved > 0) {
        await tx.execute(sql`UPDATE lenses SET average_rating = s.avg, rating_count = s.n
          FROM (SELECT avg(rating)::real AS avg, count(*)::int AS n FROM lens_ratings WHERE lens_id = ${keepId}) s
          WHERE id = ${keepId}`);
      }
    } else {
      await tx.execute(sql`INSERT INTO lens_compatibility (lens_id, camera_id, is_native, notes)
        SELECT lens_id, ${keepId}, is_native, notes FROM lens_compatibility WHERE camera_id = ${mergeId} ON CONFLICT DO NOTHING`);
      const moved = await tx.execute(sql`INSERT INTO camera_ratings (camera_id, ip_hash, rating, created_at)
        SELECT ${keepId}, ip_hash, rating, created_at FROM camera_ratings WHERE camera_id = ${mergeId} ON CONFLICT DO NOTHING RETURNING id`);
      ratingsMoved = moved.rowCount ?? 0;
      if (ratingsMoved > 0) {
        await tx.execute(sql`UPDATE cameras SET average_rating = s.avg, rating_count = s.n
          FROM (SELECT avg(rating)::real AS avg, count(*)::int AS n FROM camera_ratings WHERE camera_id = ${keepId}) s
          WHERE id = ${keepId}`);
      }
    }

    // A member's kit entry for the loser is an entry for the same product.
    // Someone who listed both keeps the keeper's row and the loser's still
    // resolves through merged_into_id, so nothing is lost either way.
    const kits = await tx.execute(sql`UPDATE kit_items k SET entity_id = ${keepId}, updated_at = now()
      WHERE k.entity_type = ${entityType} AND k.entity_id = ${mergeId}
        AND NOT EXISTS (SELECT 1 FROM kit_items o
          WHERE o.user_id = k.user_id AND o.entity_type = ${entityType} AND o.entity_id = ${keepId})`);

    // Retire the loser, and re-point anything already retired into it so no
    // page has to follow two hops.
    await tx.update(table).set({ mergedIntoId: keepId }).where(eq(table.id, mergeId));
    await tx.update(table).set({ mergedIntoId: keepId }).where(eq(table.mergedIntoId, mergeId));

    await tx
      .update(duplicateFlags)
      .set({ status: "confirmed", resolvedAt: new Date(), resolvedByUserId: admin?.id ?? null })
      .where(eq(duplicateFlags.id, flag.id));

    return { ratingsMoved, kitItemsMoved: kits.rowCount ?? 0 };
  });

  // History for both rows. The keeper's revision lists what came across; the
  // loser's records the retirement, which is what "undo" would revert.
  await createRevision({
    entityType,
    entityId: keepId,
    userId: admin?.id ?? null,
    summary: mergeSummary(String(loser.name), mergeId, taken),
    autoPatrol: true,
  });
  await createRevision({
    entityType,
    entityId: mergeId,
    userId: admin?.id ?? null,
    summary: `Retired as a duplicate of "${String(keeper.name)}" (#${keepId})`,
    autoPatrol: true,
  });

  // Setting mergedIntoId changes what every list filtering on it shows, and
  // getLensRelations caches lens relations for 30 days.
  revalidateTag(entityType === "lens" ? "lenses" : "cameras", "max");
  const base = entityType === "lens" ? "/lenses" : "/cameras";
  revalidatePath(`${base}/${keeper.slug}`);
  revalidatePath(`${base}/${loser.slug}`);

  // The collection pages are plain ISR with no tagged cache call, so the tag
  // above does not reach them. Revalidate the index and each collection the
  // keeper now belongs to, since those are the pages whose lens list and
  // count just changed.
  if (entityType === "lens") {
    const affected = await db
      .select({ slug: collections.slug })
      .from(lensCollections)
      .innerJoin(collections, eq(lensCollections.collectionId, collections.id))
      .where(eq(lensCollections.lensId, keepId));
    if (affected.length > 0) revalidatePath("/collections");
    for (const { slug } of affected) revalidatePath(`/collections/${slug}`);
  }

  return NextResponse.json({
    success: true,
    mergedId: mergeId,
    keptId: keepId,
    taken,
    ...stats,
  });
}
