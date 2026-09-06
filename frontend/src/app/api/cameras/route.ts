import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/camera-list";

const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawCursor = parseInt(searchParams.get("cursor") || "0");
  const cursor = Math.min(
    Math.max(Number.isFinite(rawCursor) ? rawCursor : 0, 0),
    MAX_OFFSET
  );

  try {
    const result = await listCameras({
      q: searchParams.get("q")?.slice(0, 200) || undefined,
      slug: searchParams.get("slug") || undefined,
      system: searchParams.get("system") || undefined,
      type: searchParams.get("type") || undefined,
      model: searchParams.get("model") || undefined,
      filmType: searchParams.get("filmType") || undefined,
      sensorSize: searchParams.get("sensorSize") || undefined,
      sensorType: searchParams.get("sensorType") || undefined,
      cropFactor: searchParams.get("cropFactor") || undefined,
      year: searchParams.get("year") || undefined,
      priceMin: searchParams.get("priceMin") || undefined,
      priceMax: searchParams.get("priceMax") || undefined,
      sort: searchParams.get("sort") || undefined,
      order: searchParams.get("order") || undefined,
      cursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/cameras error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
