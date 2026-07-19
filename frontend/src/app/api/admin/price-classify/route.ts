import { NextRequest, NextResponse } from "next/server";
import { classifyListings } from "@/lib/price-classify";
import { requireAdminAPI } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const body = await request.json();
  const { cameraName, listings } = body as {
    cameraName: string;
    listings: { title: string; price: number; date: string; condition?: string }[];
  };

  if (!cameraName || !listings?.length) {
    return NextResponse.json({ error: "cameraName and listings required" }, { status: 400 });
  }

  try {
    const classified = await classifyListings(cameraName, listings);

    return NextResponse.json({
      cameraName,
      classified,
      raw: listings,
    });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
