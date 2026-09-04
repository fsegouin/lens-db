import { NextRequest } from "next/server";
import { getMountsWithFlange } from "@/lib/adapters";
import { apiError, apiJson, apiOptions, LICENCE } from "@/lib/public-api";

export const revalidate = 3600;

export function OPTIONS() {
  return apiOptions();
}

/**
 * Every mount with a recorded register.
 *
 * This is the part of the database nobody else publishes: the flange focal
 * distance is what decides whether a lens can be adapted to a body, and it is
 * scattered across forum posts and manufacturer PDFs everywhere else.
 */
export async function GET(_request: NextRequest) {
  try {
    const mounts = await getMountsWithFlange();
    return apiJson({
      licence: LICENCE.facts,
      count: mounts.length,
      mounts: mounts.map((m) => ({
        id: m.slug,
        url: `https://thelensdb.com/systems/${m.slug}`,
        name: m.name,
        flangeDistanceMm: m.flangeDistanceMm,
        wikidata: m.wikidataQid
          ? {
              id: m.wikidataQid,
              url: `https://www.wikidata.org/wiki/${m.wikidataQid}`,
            }
          : null,
        lensCount: m.lensCount,
        cameraCount: m.cameraCount,
      })),
    });
  } catch (error) {
    console.error("GET /api/v1/mounts error:", error);
    return apiError("Internal server error", 500);
  }
}
