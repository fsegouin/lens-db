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
        "excellent: near-mint/mint/like-new, collector grade, minimal wear. good: very good/excellent, clean and fully functional, minor signs of use. fair: good/fair, working but with visible wear or cosmetic issues. skip: not working, untested, parts, or broken."
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

Condition grading for WORKING cameras only:
- excellent: Near-mint, mint, like-new, [N MINT], collector grade, minimal wear
- good: Excellent, [Exc+5], [Exc+4], Very Good, clean and fully functional, minor signs of use
- fair: Good, fair, working but with visible wear, cosmetic issues, or minor problems noted

For each listing provide: isRelevant, isBodyOnly, includesLens, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listings.map((l, i) => `${i + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`).join("\n")}`;

  try {
    const { output } = await generateText({
      model: "mistral/ministral-8b",
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
