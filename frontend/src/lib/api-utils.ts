import { NextRequest, NextResponse } from "next/server";

/**
 * Get the client's real IP address.
 *
 * On Vercel, `x-forwarded-for` is set by the platform at the edge and
 * cannot be spoofed by the client — Vercel overwrites it on every request.
 */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function hashIP(ip: string): Promise<string> {
  const salt = process.env.RATE_HASH_SALT;
  if (!salt) {
    throw new Error("RATE_HASH_SALT environment variable is not set");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function rateLimitedResponse() {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429 }
  );
}
