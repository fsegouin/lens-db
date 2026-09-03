import { NextRequest } from "next/server";
import { getPublicCameras } from "@/lib/public-data";
import { apiError, apiJson, apiOptions, LICENCE } from "@/lib/public-api";

export const revalidate = 3600;

export function OPTIONS() {
  return apiOptions();
}

/** GET ?limit=100&after=<id> walks every camera in id order. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawLimit = parseInt(searchParams.get("limit") || "100");
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
  const rawAfter = parseInt(searchParams.get("after") || "0");
  const after = Math.max(Number.isFinite(rawAfter) ? rawAfter : 0, 0);

  try {
    const { items, nextAfter } = await getPublicCameras({ limit, after });
    return apiJson({
      licence: LICENCE.facts,
      note: LICENCE.excluded,
      count: items.length,
      nextAfter,
      cameras: items,
    });
  } catch (error) {
    console.error("GET /api/v1/cameras error:", error);
    return apiError("Internal server error", 500);
  }
}
