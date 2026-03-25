import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

// GET: validate token exists and redirect to confirmation page (no side effects)
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
    }

    // Check token exists and is not expired (do NOT consume it)
    const [record] = await db
      .select({ id: emailVerificationTokens.id })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.token, token),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
    }

    // Token is valid — redirect to confirmation page (user must click to verify)
    return NextResponse.redirect(new URL(`/verify-email?token=${token}`, request.url));
  } catch (error) {
    console.error("GET /api/auth/verify-email error:", error);
    return NextResponse.redirect(new URL("/login?error=server-error", request.url));
  }
}

// POST: actually consume the token and verify the user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const [record] = await db
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
      })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.token, token),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Mark user as verified
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, record.userId));

    // Delete used token
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, record.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/verify-email error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
