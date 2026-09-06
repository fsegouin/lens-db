import { NextRequest, NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail, maskEmail } from "@/lib/email";

const resendLimiter = createRateLimit("auth-resend", 3, "600 s");

const GENERIC = {
  success: true,
  message: "If that address has an unverified account, a new link is on its way.",
};

/**
 * A lost or spam-filtered verification email used to be a dead account: the
 * only token was minted at registration and nothing could mint another. This
 * does, without saying whether the address exists.
 */
export async function POST(request: NextRequest) {
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const ip = getClientIP(request);
    const [byIp, byEmail] = await Promise.all([
      resendLimiter.limit(`resend:ip:${ip}`),
      resendLimiter.limit(`resend:email:${email}`),
    ]);
    if (!byIp.success || !byEmail.success) return rateLimitedResponse();

    const [user] = await db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, isBanned: users.isBanned })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.emailVerifiedAt || user.isBanned) {
      return NextResponse.json(GENERIC);
    }

    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    const token = crypto.randomUUID();
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      await sendVerificationEmail(email, token);
    } catch (err) {
      console.error(`[resend-verification] Failed to send to ${maskEmail(email)}:`, err);
    }

    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error("POST /api/auth/resend-verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
