import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
    }

    // Find valid (non-expired) token
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
      return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
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

    return NextResponse.redirect(new URL("/login?verified=true", request.url));
  } catch (error) {
    console.error("GET /api/auth/verify-email error:", error);
    return NextResponse.redirect(new URL("/login?error=server-error", request.url));
  }
}
