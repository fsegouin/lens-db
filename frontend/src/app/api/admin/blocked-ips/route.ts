import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blockedIps, issueReports } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.ipAddress !== "string" || !body.ipAddress.trim()) {
    return NextResponse.json({ error: "Invalid IP" }, { status: 400 });
  }

  const ip = body.ipAddress.trim();

  await Promise.all([
    db
      .insert(blockedIps)
      .values({ ipAddress: ip, reason: "Blocked from admin reports panel" })
      .onConflictDoNothing(),
    db
      .delete(issueReports)
      .where(
        and(
          eq(issueReports.ipAddress, ip),
          eq(issueReports.status, "pending")
        )
      ),
  ]);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip");
  if (!ip) {
    return NextResponse.json({ error: "Missing IP" }, { status: 400 });
  }

  await db.delete(blockedIps).where(eq(blockedIps.ipAddress, ip));

  return NextResponse.json({ success: true });
}
