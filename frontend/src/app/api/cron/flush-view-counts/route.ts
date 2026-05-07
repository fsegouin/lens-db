import { NextRequest, NextResponse } from "next/server";
import { flushViewCounts } from "@/lib/view-counts";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await flushViewCounts();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to flush view counts:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
