import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

export async function verifyPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
    crypto.subtle.digest("SHA-256", encoder.encode(adminPassword)),
  ]);
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  if (viewA.length !== viewB.length) return false;
  let result = 0;
  for (let i = 0; i < viewA.length; i++) result |= viewA[i] ^ viewB[i];
  return result === 0;
}

/**
 * Create a signed session token: "expiresAt.signature"
 * Uses HMAC-SHA256 with ADMIN_PASSWORD as the key.
 * No server-side state — survives hot reloads and cold starts.
 */
export async function createSession(): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const signature = await sign(String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function validateSession(token: string): Promise<boolean> {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;

  const expiresAt = parseInt(token.substring(0, dotIndex), 10);
  const signature = token.substring(dotIndex + 1);

  if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = await sign(String(expiresAt));
  // Constant-time comparison
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function sign(data: string): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD || "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL,
  };
}

export async function requireAdmin(): Promise<void> {
  const token = await getSessionToken();
  if (!token || !(await validateSession(token))) {
    redirect("/admin/login");
  }
}

export async function requireAdminAPI(token: string | undefined): Promise<NextResponse | null> {
  if (!token || !(await validateSession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
