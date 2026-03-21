import { NextRequest, NextResponse } from "next/server";
import { getRevision, diffRevisions } from "@/lib/revisions";
import { db } from "@/db";
import { revisions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const revisionId = parseInt(id, 10);
  if (isNaN(revisionId)) {
    return NextResponse.json({ error: "Invalid revision ID" }, { status: 400 });
  }

  const revision = await getRevision(revisionId);
  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  // Compute diff against previous revision if one exists
  let diff = null;
  if (revision.revisionNumber > 1) {
    const [prev] = await db
      .select({ data: revisions.data })
      .from(revisions)
      .where(
        and(
          eq(revisions.entityType, revision.entityType),
          eq(revisions.entityId, revision.entityId),
          eq(revisions.revisionNumber, revision.revisionNumber - 1)
        )
      )
      .limit(1);
    if (prev) {
      diff = diffRevisions(
        prev.data as Record<string, unknown>,
        revision.data as Record<string, unknown>
      );
    }
  }

  return NextResponse.json({ revision, diff });
}
