import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "user_session";
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
// Stored as "pbkdf2:<iterations>:<salt>:<hash>". Rows written before the
// format carried a version are "<salt>:<hash>" at 100,000 iterations; they
// verify and are rehashed on the next successful sign-in.
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_PBKDF2_ITERATIONS = 100_000;
const HASH_FORMAT = "pbkdf2";

// ─── Password Hashing ──────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const hash = await crypto.subtle.exportKey("raw", key);
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(new Uint8Array(hash));
  return `${HASH_FORMAT}:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/** Whether a stored hash predates the current format or cost. */
export function passwordNeedsRehash(stored: string): boolean {
  const parts = stored.split(":");
  return parts.length !== 4 || parts[0] !== HASH_FORMAT || Number(parts[1]) !== PBKDF2_ITERATIONS;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  let iterations: number;
  let saltHex: string;
  let hashHex: string;
  if (parts.length === 4 && parts[0] === HASH_FORMAT) {
    iterations = Number(parts[1]);
    saltHex = parts[2];
    hashHex = parts[3];
  } else if (parts.length === 2) {
    iterations = LEGACY_PBKDF2_ITERATIONS;
    [saltHex, hashHex] = parts;
  } else {
    return false;
  }
  if (!saltHex || !hashHex || !Number.isInteger(iterations) || iterations < 1) return false;
  const salt = hexToBytes(saltHex);
  const key = await deriveKey(password, salt, iterations);
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
  salt: Uint8Array,
  iterations: number
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
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
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
// Token format: "userId.expiresAt.keyTag.signature". No server-side session
// store; keyTag is a short digest of the password hash the session was
// issued under, so a password change or reset ends every session at once.

async function sign(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required for session signing"
    );
  }
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

async function passwordKeyTag(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash));
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
}

export async function createUserSession(userId: number, passwordHash: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `${userId}.${expiresAt}.${await passwordKeyTag(passwordHash)}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The signature proves the token was issued here; the key tag is then
 * checked against the account's current password hash, so a token issued
 * before a password change no longer opens the account.
 */
export async function validateUserSession(
  token: string
): Promise<{ userId: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userIdStr, expiresAtStr, keyTag, signature] = parts;
  const userId = parseInt(userIdStr, 10);
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(userId) || isNaN(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  let expected: string;
  try {
    expected = await sign(`${userId}.${expiresAt}.${keyTag}`);
  } catch {
    return null;
  }
  if (!constantTimeEqual(signature, expected)) return null;

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  if (!constantTimeEqual(keyTag, await passwordKeyTag(user.passwordHash))) return null;
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
  handle: string | null;
  kitIsPublic: boolean;
  kitCurrency: string;
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
      handle: users.handle,
      kitIsPublic: users.kitIsPublic,
      kitCurrency: users.kitCurrency,
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
      handle: users.handle,
      kitIsPublic: users.kitIsPublic,
      kitCurrency: users.kitCurrency,
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
