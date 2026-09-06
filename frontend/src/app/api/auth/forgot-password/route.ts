import { NextRequest, NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail, maskEmail } from "@/lib/email";

const forgotLimiter = createRateLimit("auth-forgot", 3, "600 s");

const GENERIC = {
  success: true,
  message: "If that address has an account, a reset link is on its way.",
};

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
      forgotLimiter.limit(`forgot:ip:${ip}`),
      forgotLimiter.limit(`forgot:email:${email}`),
    ]);
    if (!byIp.success || !byEmail.success) return rateLimitedResponse();

    const [user] = await db
      .select({ id: users.id, isBanned: users.isBanned })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.isBanned) {
      return NextResponse.json(GENERIC);
    }

    // One live link at a time: an older one is revoked by asking again.
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    const token = crypto.randomUUID();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    try {
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error(`[forgot-password] Failed to send to ${maskEmail(email)}:`, err);
    }

    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
