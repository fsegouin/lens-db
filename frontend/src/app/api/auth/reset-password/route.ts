import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/user-auth";

const resetLimiter = createRateLimit("auth-reset", 10, "600 s");

const INVALID = { error: "Invalid or expired link. Ask for a new one." };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await resetLimiter.limit(`reset:${ip}`);
    if (!success) return rateLimitedResponse();

    const body = await request.json().catch(() => null);
    const token = body?.token;
    const password = body?.password;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Password must be 8-128 characters" }, { status: 400 });
    }

    const [record] = await db
      .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), gt(passwordResetTokens.expiresAt, new Date())))
      .limit(1);

    if (!record) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    const [user] = await db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, isBanned: users.isBanned })
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1);
    if (!user || user.isBanned) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    // Following a link from the inbox proves the address, so an account that
    // never clicked its verification link is verified by this instead.
    await db
      .update(users)
      .set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
      .where(eq(users.id, user.id));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
