import { NextRequest, NextResponse } from "next/server";
import { partnerError, partnerJson, requirePartner } from "@/lib/partner-auth";
import { searchCatalogue } from "@/lib/partner-catalogue";
import { parseSearchRequest } from "@/lib/partner-objects";

/** GET /api/partner/v1/search?q=&type=&brand=&limit= */
export async function GET(request: NextRequest) {
  const owner = await requirePartner(request, "kit");
  if (owner instanceof NextResponse) return owner;

  const search = parseSearchRequest(request.nextUrl.searchParams);
  if (typeof search === "string") return partnerError(search, 400);

  try {
    return partnerJson({ results: await searchCatalogue(search) });
  } catch (error) {
    console.error("GET /api/partner/v1/search error:", error);
    return partnerError("Search is unavailable", 500);
  }
}
