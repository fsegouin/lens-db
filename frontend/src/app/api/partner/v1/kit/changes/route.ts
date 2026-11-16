import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { partnerError, partnerJson, requirePartner } from "@/lib/partner-auth";
import { applyKitChanges, getKitDocument } from "@/lib/partner-catalogue";
import { etagOf, parseKitChanges } from "@/lib/partner-objects";

/**
 * POST /api/partner/v1/kit/changes: everything an app has to add and remove,
 * in one call. Answers with the kit as it now stands and the ETag GET /kit
 * would give it, so the app needs no second read.
 */
export async function POST(request: NextRequest) {
  const owner = await requirePartner(request, "kit");
  if (owner instanceof NextResponse) return owner;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return partnerError("The body must be JSON", 400);
  }
  const changes = parseKitChanges(body);
  if (typeof changes === "string") return partnerError(changes, 400);

  try {
    const { notFound, changed } = await applyKitChanges(owner.userId, changes);
    // Owner lists and public kits are cached under this tag.
    if (changed) revalidateTag("kit", "max");

    const document = await getKitDocument(owner);
    return partnerJson(
      { ...document, notFound },
      { headers: { ETag: etagOf(JSON.stringify(document)) } },
    );
  } catch (error) {
    console.error("POST /api/partner/v1/kit/changes error:", error);
    return partnerError("The kit could not be changed", 500);
  }
}
