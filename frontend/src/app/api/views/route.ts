import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { bumpViewCount, type ViewType } from "@/lib/view-counts";

const VALID_TYPES = ["lens", "camera", "system"] as const;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await rateLimiters.views.limit(ip);
    if (!success) return rateLimitedResponse();

    const body = await request.json();
    const type = body.type as string;
    const id = typeof body.id === "number" ? body.id : NaN;

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !VALID_TYPES.includes(type as ViewType)
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await bumpViewCount(type as ViewType, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/views error:", error);
    return NextResponse.json(
      { error: "Failed to track view" },
      { status: 500 }
    );
  }
}
