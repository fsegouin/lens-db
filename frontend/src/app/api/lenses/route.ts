import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { listLenses } from "@/lib/lens-list";

const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const { searchParams } = request.nextUrl;
  const rawCursor = parseInt(searchParams.get("cursor") || "0");
  const cursor = Math.min(
    Math.max(Number.isFinite(rawCursor) ? rawCursor : 0, 0),
    MAX_OFFSET
  );

  try {
    const result = await listLenses({
      q: searchParams.get("q")?.slice(0, 200) || undefined,
      slug: searchParams.get("slug") || undefined,
      brand: searchParams.get("brand") || undefined,
      system: searchParams.get("system") || undefined,
      coverage: searchParams.get("coverage") || undefined,
      type: searchParams.get("type") || undefined,
      minFocal: searchParams.get("minFocal") || undefined,
      maxFocal: searchParams.get("maxFocal") || undefined,
      minAperture: searchParams.get("minAperture") || undefined,
      maxAperture: searchParams.get("maxAperture") || undefined,
      year: searchParams.get("year") || undefined,
      lensType: searchParams.get("lensType") || undefined,
      era: searchParams.get("era") || undefined,
      productionStatus: searchParams.get("productionStatus") || undefined,
      series: searchParams.get("series") || undefined,
      priceMin: searchParams.get("priceMin") || undefined,
      priceMax: searchParams.get("priceMax") || undefined,
      sort: searchParams.get("sort") || undefined,
      order: searchParams.get("order") || undefined,
      cursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/lenses error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
