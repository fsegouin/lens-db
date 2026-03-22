import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { issueReports } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq } from "drizzle-orm";
import { applyCorrection } from "@/lib/apply-correction";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
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
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  if (!body.status || !["accepted", "dismissed", "pending"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Fetch the report first to check if it has a field correction
  const [report] = await db
    .select()
    .from(issueReports)
    .where(eq(issueReports.id, parseInt(id)));

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Auto-apply correction when marking as reviewed
  let applied = false;
  if (
    body.status === "accepted" &&
    report.fieldName &&
    report.suggestedValue
  ) {
    applied = await applyCorrection(
      report.entityType,
      report.entityId,
      report.fieldName,
      report.suggestedValue
    );
  }

  const [updated] = await db
    .update(issueReports)
    .set({ status: body.status })
    .where(eq(issueReports.id, parseInt(id)))
    .returning();

  return NextResponse.json({ ...updated, applied });
}
