import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * POST /api/admin/price-classify
 *
 * Takes an array of raw eBay sold listings and classifies each one using an LLM.
 * Returns structured data: matched model, condition grade, whether it's body-only,
 * and the effective sale price.
 *
 * This is the core of the price pipeline — designed to be called by a cron job
 * or manually from the admin panel.
 */

const ClassifiedListingSchema = z.object({
  listings: z.array(
    z.object({
      isRelevant: z.boolean().describe(
        "True only if: (1) this is the exact target camera model, (2) it's in working condition (not for parts/repair/broken/untested), (3) it's a single item (not a lot)"
      ),
      isBodyOnly: z.boolean().describe(
        "True if the listing is for the camera body only (no lens included)"
      ),
      includesLens: z.string().nullable().describe(
        "If a lens is included, describe it (e.g. 'FD 50mm f/1.8'). Null if body only."
      ),
      conditionGrade: z.enum(["excellent", "good", "fair", "skip"]).describe(
        "Be strict — most cameras are 'good'. excellent: ONLY mint/near-mint/top-mint with zero caveats (10-20% of listings). good: the default for any working camera in decent shape — Exc+5, Very Good, tested, CLA'd, refurbished. fair: working but with noted issues, cosmetic damage, needs work, or vague condition claims. skip: broken, parts, untested."
      ),
      conditionNotes: z.string().describe(
        "Brief notes about condition from the listing title"
      ),
      effectivePrice: z.number().describe(
        "The actual sale price in USD (not including shipping)"
      ),
    })
  ),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cameraName, listings } = body as {
    cameraName: string;
    listings: { title: string; price: number; date: string; condition?: string }[];
  };

  if (!cameraName || !listings?.length) {
    return NextResponse.json({ error: "cameraName and listings required" }, { status: 400 });
  }

  const prompt = `You are classifying eBay sold listings for the camera: "${cameraName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${cameraName}" (exact model, not a variant like "AE-1 Program" vs "AE-1").
- Mark isRelevant=false for: parts/repair, untested, broken, lots/bundles, different models, accessories only.
- conditionGrade "skip" should be used for anything not in working condition — these will be filtered out entirely.

Condition grading — be strict, most used cameras are "good", not "excellent":
- excellent: ONLY if explicitly described as mint, near-mint, [N MINT], [Top MINT], [MINT in Box], or collector grade. Must have no caveats. This is rare — maybe 10-20% of listings.
- good: The default for working cameras. Includes [Exc+5], [Exc+4], Excellent, Very Good, tested/working, CLA'd, Good Refurbished, Very Good Refurbished. Most listings should be here.
- fair: Any camera with caveats: *Read, cosmetic damage noted, "works but...", needs light seals, minor issues mentioned, no condition info given, just "body only" with no condition claim.

For each listing provide: isRelevant, isBodyOnly, includesLens, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listings.map((l, i) => `${i + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`).join("\n")}`;

  try {
    const { output } = await generateText({
      model: "google/gemini-2.0-flash-lite",
      output: Output.object({ schema: ClassifiedListingSchema }),
      prompt,
    });

    return NextResponse.json({
      cameraName,
      classified: output?.listings ?? [],
      raw: listings,
    });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json(
      { error: "Classification failed", details: String(error) },
      { status: 500 }
    );
  }
}
