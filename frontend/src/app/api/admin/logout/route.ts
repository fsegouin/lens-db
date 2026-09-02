import { NextResponse } from "next/server";
import { clearUserSessionCookie } from "@/lib/user-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearUserSessionCookie());
  return response;
}
