import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { issueReports } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const [report] = await db
    .select()
    .from(issueReports)
    .where(eq(issueReports.id, parseInt(id)));

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  if (!body.status || !["reviewed", "dismissed", "pending"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [updated] = await db
    .update(issueReports)
    .set({ status: body.status })
    .where(eq(issueReports.id, parseInt(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
