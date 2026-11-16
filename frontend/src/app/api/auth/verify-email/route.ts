import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq, and, gt, inArray } from "drizzle-orm";
import { sendWelcomeEmail, maskEmail } from "@/lib/email";
import { storedForms } from "@/lib/one-shot-token";
import { safeNextPath, signInPath } from "@/lib/safe-next";

// GET: validate token exists and redirect to confirmation page (no side effects)
export async function GET(request: NextRequest) {
  // The way back rides on every answer, so a link that expired or was already
  // used still returns the member to what they were connecting.
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const toSignIn = (error: string) =>
    NextResponse.redirect(new URL(signInPath({ error }, next), request.url));
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return toSignIn("invalid-token");

    // Check token exists and is not expired (do NOT consume it)
    const [record] = await db
      .select({ id: emailVerificationTokens.id })
      .from(emailVerificationTokens)
      .where(
        and(
          inArray(emailVerificationTokens.token, storedForms(token)),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!record) return toSignIn("invalid-token");

    // Token is valid: redirect to confirmation page (user must click to verify)
    const query = new URLSearchParams({ token, ...(next ? { next } : {}) });
    return NextResponse.redirect(new URL(`/verify-email?${query}`, request.url));
  } catch (error) {
    console.error("GET /api/auth/verify-email error:", error);
    return toSignIn("server-error");
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

    // Consumed by the statement that finds it, so a double submit cannot
    // verify twice or send two welcome emails.
    const [record] = await db
      .delete(emailVerificationTokens)
      .where(
        and(
          inArray(emailVerificationTokens.token, storedForms(token)),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .returning({ userId: emailVerificationTokens.userId });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Mark user as verified
    const [verified] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, record.userId))
      .returning({ email: users.email, displayName: users.displayName });

    // The welcome note is the first thing that says what an account is for.
    // It must never make verification fail, so it is awaited only for logging.
    if (verified) {
      try {
        await sendWelcomeEmail(verified.email, verified.displayName);
      } catch (err) {
        console.error(`[verify-email] Failed to send welcome email to ${maskEmail(verified.email)}:`, err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/verify-email error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
