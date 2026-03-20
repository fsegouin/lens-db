import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { hashPassword, createUserSession, userSessionCookieOptions } from "@/lib/user-auth";
import { sendVerificationEmail } from "@/lib/email";

const registerLimiter = createRateLimit(5, "60 s");

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await registerLimiter.limit(`register:${ip}`);
    if (!success) return rateLimitedResponse();

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, password, displayName } = body;

    // Validate fields
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 30) {
      return NextResponse.json({ error: "Display name must be 2-30 characters" }, { status: 400 });
    }
    // Only allow alphanumeric, spaces, hyphens, underscores in display name
    if (!/^[\w\s-]+$/.test(displayName.trim())) {
      return NextResponse.json({ error: "Display name can only contain letters, numbers, spaces, hyphens, and underscores" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName = displayName.trim();

    // Check uniqueness
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const [existingName] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.displayName, trimmedName))
      .limit(1);
    if (existingName) {
      return NextResponse.json({ error: "Display name already taken" }, { status: 409 });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        displayName: trimmedName,
      })
      .returning({ id: users.id });

    // Create verification token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      token,
      expiresAt,
    });

    // Send verification email (fire and forget — don't block registration)
    sendVerificationEmail(normalizedEmail, token).catch((err) =>
      console.error("Failed to send verification email:", err)
    );

    // Create session
    const sessionToken = await createUserSession(newUser.id);
    const response = NextResponse.json({ success: true, user: { id: newUser.id, displayName: trimmedName } });
    response.cookies.set(userSessionCookieOptions(sessionToken));
    return response;
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
