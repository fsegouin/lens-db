import { NextRequest, NextResponse } from "next/server";
import { disconnectApp } from "@/lib/oauth-store";
import { requireUserAPI } from "@/lib/user-auth";

const SESSION_COOKIE = "user_session";

/** DELETE /api/account/apps?client=<id>: the member disconnects an app from their kit page. */
export async function DELETE(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  const clientId = request.nextUrl.searchParams.get("client");
  if (!clientId) return NextResponse.json({ error: "client is required" }, { status: 400 });

  try {
    await disconnectApp(auth.user.id, clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/account/apps error:", error);
    return NextResponse.json({ error: "Could not disconnect the app" }, { status: 500 });
  }
}
