import { NextResponse } from "next/server";

// Admin login is no longer a separate flow.
// Admins log in through /api/auth/login like all users.
export async function POST() {
  return NextResponse.json(
    { error: "Admin login has been removed. Please use /login to sign in with your admin account." },
    { status: 410 }
  );
}
