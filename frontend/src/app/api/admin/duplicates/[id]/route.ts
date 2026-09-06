import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import { collections, duplicateFlags, lensCollections, lenses, cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const flagId = parseInt(id, 10);
  const body = await request.json();
  const { action, keepEntityId } = body as {
    action: "confirm" | "dismiss";
    keepEntityId?: number;
  };

  const [flag] = await db
    .select()
    .from(duplicateFlags)
    .where(eq(duplicateFlags.id, flagId))
    .limit(1);

  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    await db
      .update(duplicateFlags)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(duplicateFlags.id, flagId));
    return NextResponse.json({ success: true });
  }

  if (action === "confirm") {
    if (keepEntityId !== flag.sourceEntityId && keepEntityId !== flag.targetEntityId) {
      return NextResponse.json(
        { error: "keepEntityId must be one of the flagged entities" },
        { status: 400 }
      );
    }

    // Determine which entity to keep and which to merge
    const mergeId =
      keepEntityId === flag.sourceEntityId
        ? flag.targetEntityId
        : flag.sourceEntityId;
    const keepId =
      keepEntityId === flag.sourceEntityId
        ? flag.sourceEntityId
        : flag.targetEntityId;

    const table = flag.sourceEntityType === "lens" ? lenses : cameras;

    // Set mergedIntoId on the merged entity
    await db
      .update(table)
      .set({ mergedIntoId: keepId })
      .where(eq(table.id, mergeId));

    // Mark flag as confirmed
    await db
      .update(duplicateFlags)
      .set({ status: "confirmed", resolvedAt: new Date() })
      .where(eq(duplicateFlags.id, flagId));

    // Setting mergedIntoId changes what every list filtering on it shows, and
    // getLensRelations caches lens relations for 30 days. Nothing here
    // invalidated anything before.
    revalidateTag(flag.sourceEntityType === "lens" ? "lenses" : "cameras", "max");

    // The collection pages are plain ISR with no tagged cache call, so the tag
    // above does not reach them. Revalidate the index and each collection the
    // merged-away lens belonged to, since those are the pages whose lens list
    // and count just changed.
    if (flag.sourceEntityType === "lens") {
      const affected = await db
        .select({ slug: collections.slug })
        .from(lensCollections)
        .innerJoin(collections, eq(lensCollections.collectionId, collections.id))
        .where(eq(lensCollections.lensId, mergeId));
      if (affected.length > 0) revalidatePath("/collections");
      for (const { slug } of affected) revalidatePath(`/collections/${slug}`);
    }

    return NextResponse.json({ success: true, mergedId: mergeId, keptId: keepId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
