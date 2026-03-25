import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateUserSession } from "@/lib/user-auth";

const SESSION_COOKIE = "user_session";

/**
 * Get the current admin user from the user_session cookie.
 * Returns the user if they exist and have role "admin", null otherwise.
 * The role is ALWAYS checked from the database — never from the token.
 */
async function getAdminUser(): Promise<{ id: number; role: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await validateUserSession(token);
  if (!session) return null;

  const [user] = await db
    .select({ id: users.id, role: users.role, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.isBanned || user.role !== "admin") return null;
  return { id: user.id, role: user.role };
}

/**
 * Validate admin from an API request's cookie.
 * The role is ALWAYS checked from the database — never from the token.
 */
export async function getAdminUserFromToken(
  token: string | undefined
): Promise<{ id: number; role: string } | null> {
  if (!token) return null;

  const session = await validateUserSession(token);
  if (!session) return null;

  const [user] = await db
    .select({ id: users.id, role: users.role, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.isBanned || user.role !== "admin") return null;
  return { id: user.id, role: user.role };
}

/**
 * Server Component guard — redirects to /login if not an admin.
 */
export async function requireAdmin(): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/login");
  }
}

/**
 * API route guard — returns 401 response if not an admin.
 * Call with the user_session cookie value.
 */
export async function requireAdminAPI(
  token: string | undefined
): Promise<NextResponse | null> {
  const admin = await getAdminUserFromToken(token);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
