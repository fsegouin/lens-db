import { NextRequest, NextResponse } from "next/server";
import { partnerError, partnerJson, requirePartner } from "@/lib/partner-auth";
import { getKitDocument } from "@/lib/partner-catalogue";
import { etagMatches, etagOf } from "@/lib/partner-objects";

/**
 * GET /api/partner/v1/kit: the whole kit, unpaged. An app that sends back the
 * ETag in If-None-Match gets a 304 with no body until something changes,
 * whether in the kit or in the catalogue entries it points at.
 */
export async function GET(request: NextRequest) {
  const owner = await requirePartner(request, "kit");
  if (owner instanceof NextResponse) return owner;

  try {
    const document = await getKitDocument(owner);
    const etag = etagOf(JSON.stringify(document));
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-store" },
      });
    }
    return partnerJson(document, { headers: { ETag: etag } });
  } catch (error) {
    console.error("GET /api/partner/v1/kit error:", error);
    return partnerError("The kit is unavailable", 500);
  }
}
