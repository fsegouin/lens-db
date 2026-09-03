import { NextRequest } from "next/server";
import { adaptVerdict, getMountsWithFlange } from "@/lib/adapters";
import { apiError, apiJson, apiOptions, LICENCE } from "@/lib/public-api";

export const revalidate = 3600;

export function OPTIONS() {
  return apiOptions();
}

/**
 * Can this lens mount go on that body: GET ?from=canon-fd&to=sony-e
 *
 * The verdict is arithmetic on two registers, so it is returned with both
 * figures and the gap between them. A caller that disagrees can check the sum
 * rather than take the answer on trust.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return apiError("from and to are required, as mount ids", 400);
  }

  try {
    const mounts = await getMountsWithFlange();
    const bySlug = new Map(mounts.map((m) => [m.slug, m]));
    const lensMount = bySlug.get(from);
    const bodyMount = bySlug.get(to);

    if (!lensMount) return apiError(`No mount with a recorded register: ${from}`, 404);
    if (!bodyMount) return apiError(`No mount with a recorded register: ${to}`, 404);

    const verdict = adaptVerdict(lensMount, bodyMount);

    return apiJson({
      licence: LICENCE.facts,
      from: {
        id: lensMount.slug,
        name: lensMount.name,
        flangeDistanceMm: lensMount.flangeDistanceMm,
      },
      to: {
        id: bodyMount.slug,
        name: bodyMount.name,
        flangeDistanceMm: bodyMount.flangeDistanceMm,
      },
      verdict: verdict.kind,
      summary: verdict.summary,
      detail: verdict.detail,
      adapterRoomMm: "gapMm" in verdict ? verdict.gapMm : null,
      caveats: [
        "Focus only. This says nothing about whether the lens covers the body's sensor.",
        "It does not account for whether an adapter is sold, for electronic contacts, or for mirror clearance.",
      ],
    });
  } catch (error) {
    console.error("GET /api/v1/adapt error:", error);
    return apiError("Internal server error", 500);
  }
}
