import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "user_session";
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const PBKDF2_ITERATIONS = 100_000;

// ─── Password Hashing ──────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey("raw", key);
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(new Uint8Array(hash));
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = hexToBytes(saltHex);
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey("raw", key);
  const computed = bytesToHex(new Uint8Array(hash));
  // Constant-time comparison
  if (computed.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"]
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ─── Session Management ─────────────────────────────────────────────
// Token format: "userId.expiresAt.signature"
// Stateless — no server-side session store needed.

async function sign(data: string): Promise<string> {
  const secret =
    process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

export async function createUserSession(userId: number): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `${userId}.${expiresAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function validateUserSession(
  token: string
): Promise<{ userId: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdStr, expiresAtStr, signature] = parts;
  const userId = parseInt(userIdStr, 10);
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(userId) || isNaN(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  const expected = await sign(`${userId}.${expiresAt}`);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;
  return { userId };
}

export function userSessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL,
  };
}

export function clearUserSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

// ─── User Helpers ───────────────────────────────────────────────────

export type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  editCount: number;
  emailVerifiedAt: Date | null;
  isBanned: boolean;
  createdAt: Date | null;
};

async function getUserSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getUserSessionToken();
  if (!token) return null;
  const session = await validateUserSession(token);
  if (!session) return null;
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      editCount: users.editCount,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.isBanned) return null;
  return user as SessionUser;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) redirect("/verify-email");
  return user;
}

export async function requireUserAPI(
  token: string | undefined
): Promise<{ user: SessionUser } | NextResponse> {
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await validateUserSession(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      editCount: users.editCount,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.isBanned) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user: user as SessionUser };
}
