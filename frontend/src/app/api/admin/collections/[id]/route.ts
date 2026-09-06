import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import { collectionRedirects, collections, lensCollections, lenses } from "@/db/schema";
import { requireAdminAPI, getAdminUserFromToken } from "@/lib/admin-auth";
import { createRevision } from "@/lib/revisions";
import { and, eq, isNull, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, parseInt(id, 10)))
    .then((r) => r[0]);

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const collectionLenses = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      brand: lenses.brand,
    })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .where(eq(lensCollections.collectionId, parseInt(id, 10)));

  return NextResponse.json({ ...collection, lenses: collectionLenses });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const numericId = parseInt(id, 10);
  const admin = await getAdminUserFromToken(token);
  const body = await request.json();
  const { name, slug, description, lensIds } = body;

  // Validate everything before the first write (avoid partial updates)
  if (lensIds !== undefined) {
    if (!Array.isArray(lensIds) || !lensIds.every((v: unknown) => typeof v === "number" && Number.isInteger(v))) {
      return NextResponse.json({ error: "lensIds must be an array of integers" }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description || null;

  const [updated] =
    Object.keys(updates).length > 0
      ? await db
          .update(collections)
          .set(updates)
          .where(eq(collections.id, numericId))
          .returning()
      : await db
          .select()
          .from(collections)
          .where(eq(collections.id, numericId))
          .limit(1);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (lensIds !== undefined) {
    // Replace the membership list wholesale, but inside one transaction: this
    // deletes every row before reinserting, so an insert that fails partway
    // through used to leave the collection empty.
    await db.transaction(async (tx) => {
      await tx
        .delete(lensCollections)
        .where(eq(lensCollections.collectionId, numericId));

      if (lensIds.length > 0) {
        await tx.insert(lensCollections).values(
          lensIds.map((lensId: number) => ({
            lensId,
            collectionId: numericId,
          }))
        );
      }
    });
  }

  await createRevision({
    entityType: "collection",
    entityId: numericId,
    userId: admin!.id,
    summary: "Admin edit",
    autoPatrol: true,
  });

  // The collection badge on every member lens page comes from
  // getLensRelations, cached for 30 days under the "lenses" tag, and the index
  // is cached for 7. Revalidating only this one path left both stale.
  revalidateTag("lenses", "max");
  revalidatePath("/collections");
  revalidatePath(`/collections/${updated.slug}`);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const numericId = parseInt(id, 10);

  // Deleting a collection that still holds lenses is how you get a 404 on a
  // sitemapped URL that every one of its member lens pages links to. If it has
  // members, the caller has to say where its traffic should go: /merge moves
  // them and leaves a redirect, or ?confirm=true accepts the loss deliberately.
  //
  // Counted over live lens rows, the same way the admin list and the public
  // pages count. Counting membership rows instead would block deleting a
  // collection whose members have all been merged away, which reads as empty
  // everywhere and is exactly the sort of row worth deleting.
  const [{ lensCount }] = await db
    .select({ lensCount: sql<number>`count(${lenses.id})::int` })
    .from(lensCollections)
    .innerJoin(lenses, and(eq(lensCollections.lensId, lenses.id), isNull(lenses.mergedIntoId)))
    .where(eq(lensCollections.collectionId, numericId));

  // Redirects pointing here cascade away with the row, so deleting a
  // collection that earlier merges pointed at silently destroys their
  // redirects. That is worth naming before it happens.
  const [{ redirectCount }] = await db
    .select({ redirectCount: sql<number>`count(*)::int` })
    .from(collectionRedirects)
    .where(eq(collectionRedirects.collectionId, numericId));

  const confirmed = new URL(request.url).searchParams.get("confirm") === "true";
  if ((lensCount > 0 || redirectCount > 0) && !confirmed) {
    const parts: string[] = [];
    if (lensCount > 0) parts.push(`${lensCount} ${lensCount === 1 ? "lens" : "lenses"}`);
    if (redirectCount > 0) {
      parts.push(`${redirectCount} inbound ${redirectCount === 1 ? "redirect" : "redirects"} that would be destroyed`);
    }
    return NextResponse.json(
      {
        error: `This collection still has ${parts.join(" and ")}. Merge it into another collection, or pass confirm=true to delete it outright.`,
        lensCount,
        redirectCount,
      },
      { status: 409 }
    );
  }

  const [deleted] = await db
    .delete(collections)
    .where(eq(collections.id, numericId))
    .returning({ slug: collections.slug });

  if (deleted) {
    revalidateTag("lenses", "max");
    revalidatePath("/collections");
    revalidatePath(`/collections/${deleted.slug}`);
  }

  return NextResponse.json({ success: true });
}
