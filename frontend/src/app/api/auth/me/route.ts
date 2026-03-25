import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        editCount: user.editCount,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json({ user: null });
  }
}
