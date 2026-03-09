import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import {
  verifyPassword,
  createSession,
  sessionCookieOptions,
} from "@/lib/admin-auth";

const loginLimiter = createRateLimit(5, "60 s");

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await loginLimiter.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json().catch(() => null);
    if (!body || typeof body.password !== "string" || !body.password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(body.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    const token = createSession();
    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (error) {
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
