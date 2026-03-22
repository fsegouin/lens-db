import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { desc, sql, ilike } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search") || "";
  const limit = 50;
  const offset = (page - 1) * limit;

  const where = search
    ? ilike(users.displayName, `%${search}%`)
    : undefined;

  const [items, [countResult]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        editCount: users.editCount,
        emailVerifiedAt: users.emailVerifiedAt,
        isBanned: users.isBanned,
        banReason: users.banReason,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::integer` })
      .from(users)
      .where(where),
  ]);

  return NextResponse.json({
    users: items,
    total: countResult.total,
    page,
    totalPages: Math.ceil(countResult.total / limit),
  });
}
