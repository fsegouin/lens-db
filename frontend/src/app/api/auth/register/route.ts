import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/user-auth";
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
    if (!password || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Password must be 8-128 characters" }, { status: 400 });
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

    // Check uniqueness (use generic message to prevent account enumeration)
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingEmail) {
      return NextResponse.json({ error: "Could not create account. Email or display name may already be in use." }, { status: 409 });
    }

    const [existingName] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.displayName, trimmedName))
      .limit(1);
    if (existingName) {
      return NextResponse.json({ error: "Could not create account. Email or display name may already be in use." }, { status: 409 });
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

    // Send verification email — await to ensure errors are logged before function exits
    try {
      await sendVerificationEmail(normalizedEmail, token);
    } catch (err) {
      console.error(`[register] Failed to send verification email to ${normalizedEmail}:`, err);
    }

    // Do NOT create a session — require email verification first
    return NextResponse.json({
      success: true,
      requiresVerification: true,
      message: "Account created. Please check your email to verify your address before signing in.",
    });
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
