import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/user-auth";
import { storedForms } from "@/lib/one-shot-token";
import { revokeAllAppAccess } from "@/lib/oauth-store";

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

    // Hashed before the transaction opens, so the slow part never holds a
    // pooled connection.
    const passwordHash = await hashPassword(password);

    // One transaction: a failure part way leaves the link usable and the old
    // password in place, and a new password never lands while the apps
    // connected before it keep working.
    const done = await db.transaction(async (tx) => {
      // Consumed by the statement that finds it, so two requests racing on one
      // link cannot both get through to set a password.
      const [record] = await tx
        .delete(passwordResetTokens)
        .where(and(inArray(passwordResetTokens.token, storedForms(token)), gt(passwordResetTokens.expiresAt, new Date())))
        .returning({ userId: passwordResetTokens.userId });
      if (!record) return false;

      const [user] = await tx
        .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, isBanned: users.isBanned })
        .from(users)
        .where(eq(users.id, record.userId))
        .limit(1);
      if (!user || user.isBanned) return false;

      // Following a link from the inbox proves the address, so an account that
      // never clicked its verification link is verified by this instead.
      await tx
        .update(users)
        .set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
        .where(eq(users.id, user.id));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      // The new hash ends every session through its key tag; connected apps hold
      // tokens of their own, which have to be ended by hand.
      await revokeAllAppAccess(tx, user.id);
      return true;
    });
    if (!done) {
      return NextResponse.json(INVALID, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
