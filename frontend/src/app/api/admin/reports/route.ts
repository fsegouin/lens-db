import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { issueReports } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { desc, eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";

  const items = await db
    .select()
    .from(issueReports)
    .where(eq(issueReports.status, status))
    .orderBy(desc(issueReports.createdAt))
    .limit(100);

  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${issueReports.status} = 'pending')`,
      accepted: sql<number>`count(*) filter (where ${issueReports.status} = 'accepted')`,
      dismissed: sql<number>`count(*) filter (where ${issueReports.status} = 'dismissed')`,
    })
    .from(issueReports);

  return NextResponse.json({
    items,
    counts: {
      pending: Number(counts.pending),
      accepted: Number(counts.accepted),
      dismissed: Number(counts.dismissed),
    },
  });
}
