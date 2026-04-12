import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { asc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const items = await db.select().from(tags).orderBy(asc(tags.name));
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [created] = await db
    .insert(tags)
    .values({ name: name.trim(), slug })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    const [existing] = await db.select().from(tags).where(
      eq(tags.name, name.trim())
    );
    return NextResponse.json(existing);
  }

  return NextResponse.json(created, { status: 201 });
}
