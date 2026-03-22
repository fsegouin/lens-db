import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { duplicateFlags, users, lenses, cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";

  const [flags, [countResult]] = await Promise.all([
    db
      .select({
        id: duplicateFlags.id,
        sourceEntityType: duplicateFlags.sourceEntityType,
        sourceEntityId: duplicateFlags.sourceEntityId,
        targetEntityType: duplicateFlags.targetEntityType,
        targetEntityId: duplicateFlags.targetEntityId,
        reason: duplicateFlags.reason,
        flaggedByUserId: duplicateFlags.flaggedByUserId,
        flaggedByName: users.displayName,
        status: duplicateFlags.status,
        createdAt: duplicateFlags.createdAt,
      })
      .from(duplicateFlags)
      .leftJoin(users, eq(duplicateFlags.flaggedByUserId, users.id))
      .where(eq(duplicateFlags.status, status))
      .orderBy(desc(duplicateFlags.createdAt))
      .limit(50),
    db
      .select({ total: sql<number>`count(*)::integer` })
      .from(duplicateFlags)
      .where(eq(duplicateFlags.status, status)),
  ]);

  // Enrich with entity names
  const enriched = await Promise.all(
    flags.map(async (flag) => {
      const table = flag.sourceEntityType === "lens" ? lenses : cameras;
      const [source] = await db.select({ name: table.name, slug: table.slug }).from(table).where(eq(table.id, flag.sourceEntityId)).limit(1);
      const [target] = await db.select({ name: table.name, slug: table.slug }).from(table).where(eq(table.id, flag.targetEntityId)).limit(1);
      return {
        ...flag,
        sourceName: source?.name || "Unknown",
        sourceSlug: source?.slug || "",
        targetName: target?.name || "Unknown",
        targetSlug: target?.slug || "",
      };
    })
  );

  return NextResponse.json({ flags: enriched, total: countResult.total });
}
