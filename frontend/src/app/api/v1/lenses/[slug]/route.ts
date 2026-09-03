import { NextRequest } from "next/server";
import { getPublicLensBySlug } from "@/lib/public-data";
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
    const lens = await getPublicLensBySlug(slug);
    if (!lens) return apiError("No such lens", 404);
    return apiJson({ licence: LICENCE.facts, note: LICENCE.excluded, lens });
  } catch (error) {
    console.error("GET /api/v1/lenses/[slug] error:", error);
    return apiError("Internal server error", 500);
  }
}
