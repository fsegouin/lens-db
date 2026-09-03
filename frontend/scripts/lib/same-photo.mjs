/**
 * "Is this the same photograph?", judged by a vision model.
 *
 * A perceptual hash only catches re-encodings of one file. It cannot tell that
 * two photographers shooting the same camera, front-on, on the same white
 * sweep, produce two pictures a reader sees as the same image twice: those
 * measured 30 apart in dHash, well inside the range of genuinely different
 * views, so no threshold separates them.
 *
 * Uses the same model and gateway as the eBay listing classifier.
 */
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "google/gemini-3.1-flash-lite";

const VerdictSchema = z.object({
  duplicate: z
    .boolean()
    .describe("true when the two pictures would read as the same image on a product page"),
  reason: z.string().describe("one short clause explaining the call"),
});

const PROMPT = `These are two photographs of the same model of camera, both candidates to illustrate one page of a camera database.

Answer whether a reader would experience them as the same image shown twice, rather than as two views worth having.

Say duplicate = true when:
- they are the same shot (same angle, framing and lighting), even if one is cropped, recoloured, resized or re-encoded
- they are near-identical views: same side of the camera, same orientation, same background treatment, differing only in trivial ways

Say duplicate = false when they add something for the reader, for example:
- a different side or angle (front vs top vs back vs three-quarter)
- a different setting (studio sweep vs desk vs in hand)
- a visibly different configuration (different lens, with or without strap, body only vs full kit)

Judge the pictures, not the file names.`;

/**
 * @returns {Promise<{duplicate: boolean, reason: string}>} Fails open with
 * duplicate:false, because losing a usable photograph to a transient gateway
 * error is worse than letting a near-duplicate through.
 */
export async function isSamePhoto(bufferA, bufferB) {
  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: VerdictSchema }),
      timeout: 30_000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image", image: bufferA },
            { type: "image", image: bufferB },
          ],
        },
      ],
    });
    return { duplicate: Boolean(output?.duplicate), reason: output?.reason ?? "" };
  } catch (error) {
    console.error(`  [same-photo] check failed, keeping both: ${error.message}`);
    return { duplicate: false, reason: "check failed" };
  }
}
