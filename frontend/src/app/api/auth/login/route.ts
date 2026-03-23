import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { verifyPassword, createUserSession, userSessionCookieOptions } from "@/lib/user-auth";

const loginLimiter = createRateLimit(10, "60 s");

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await loginLimiter.limit(`user-login:${ip}`);
    if (!success) return rateLimitedResponse();

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, password } = body;
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
        isBanned: users.isBanned,
        banReason: users.banReason,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.isBanned) {
      return NextResponse.json(
        { error: "Account suspended" },
        { status: 403 }
      );
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Please verify your email before signing in. Check your inbox for a verification link.", code: "EMAIL_NOT_VERIFIED" },
        { status: 403 }
      );
    }

    const sessionToken = await createUserSession(user.id);
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, displayName: user.displayName },
    });
    response.cookies.set(userSessionCookieOptions(sessionToken));
    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
