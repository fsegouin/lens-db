import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";

const SESSION_COOKIE = "user_session";

/** Whether the weekly digest goes to this account. */
export async function PATCH(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.optIn !== "boolean") {
    return NextResponse.json({ error: "optIn must be a boolean" }, { status: 400 });
  }

  try {
    await db
      .update(users)
      .set({ digestOptIn: body.optIn })
      .where(eq(users.id, auth.user.id));
    return NextResponse.json({ ok: true, optIn: body.optIn });
  } catch (error) {
    console.error("PATCH /api/account/digest error:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
