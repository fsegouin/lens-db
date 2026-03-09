import { cookies } from "next/headers";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory session store (cleared on cold start — acceptable for single-admin)
const sessions = new Map<string, { expiresAt: number }>();

export async function verifyPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  // Constant-time comparison via hashing both
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

export function createSession(): string {
  const token = crypto.randomUUID() + crypto.randomUUID();
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
  return token;
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
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
    maxAge: SESSION_TTL / 1000,
  };
}
