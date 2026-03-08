import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, systems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

const VALID_TYPES = ["lens", "camera", "system"] as const;
type ViewType = (typeof VALID_TYPES)[number];

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

    const table =
      type === "lens" ? lenses : type === "camera" ? cameras : systems;

    await db
      .update(table)
      .set({ viewCount: sql`${table.viewCount} + 1` })
      .where(eq(table.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/views error:", error);
    return NextResponse.json(
      { error: "Failed to track view" },
      { status: 500 }
    );
  }
}
