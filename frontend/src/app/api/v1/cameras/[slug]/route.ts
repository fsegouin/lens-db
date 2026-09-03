import { NextRequest } from "next/server";
import { getPublicCameraBySlug } from "@/lib/public-data";
import { apiError, apiJson, apiOptions, LICENCE } from "@/lib/public-api";

export const revalidate = 3600;

export function OPTIONS() {
  return apiOptions();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const camera = await getPublicCameraBySlug(slug);
    if (!camera) return apiError("No such camera", 404);
    return apiJson({ licence: LICENCE.facts, note: LICENCE.excluded, camera });
  } catch (error) {
    console.error("GET /api/v1/cameras/[slug] error:", error);
    return apiError("Internal server error", 500);
  }
}
