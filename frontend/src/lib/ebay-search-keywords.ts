import { generateText, Output } from "ai";
import { z } from "zod";
import { cleanSearchKeywords } from "./ebay-search-query.ts";

/**
 * Ask a model for the words an eBay seller would put in a title for a lens
 * or a camera body.
 *
 * The Browse API is a strict AND over every word of the query, and the
 * catalogue writes names sellers never do: "[II]", "Gen. X", "Type 2", "FDn",
 * "F/1L", "| C" on lenses; "(Typ 2248)", "Year 2000 Millennium", "SLT-A77 II"
 * on bodies. On the first asking-price sweep half the lens catalogue and a
 * fifth of the bodies found no listing at all, including products with
 * dozens of recorded sales, because one of those words was in the query. A
 * hand-written reducer would have to know that "FDn" means "New FD", that
 * "LSM" sellers write as "L39" or "LTM", and that a Sony "SLT-A77" is listed
 * as an "A77"; the model already does.
 *
 * Recall is the goal here, not precision. The classifier that judges every
 * listing against the full catalogue name is what keeps a loose query from
 * pricing a product off its neighbours, so the query only has to find the
 * product's listings among others, never to exclude them.
 */

const KeywordsSchema = z.object({
  keywords: z
    .string()
    .describe("Three to six words, no punctuation beyond what is inside a number."),
});

const BRAND_RULE =
  "- The brand is the one buyers search by: Pentax not Asahi, Nikon not Nippon Kogaku, Leica not Leitz Wetzlar or Leitz Canada, Zeiss not Carl Zeiss, Voigtlander not Cosina Voigtlander.";

/**
 * A word the name does not contain is a guess, and a guess that finds
 * listings is worse than none: the model once turned "Leica M7 Flag" into
 * "Leica M7 Titanium", and a query like that would have found a different
 * camera, been kept because it found something, and rejected by the judge
 * on every sweep after.
 */
const NO_INVENTION_RULE =
  "- Use only words that appear in the name above, including any in brackets, apart from the brand spellings and abbreviation expansions these rules name. Never add a word of your own.";

const LENS_RULES = `- Three to six words: the brand, the focal length as sellers write it ("50mm", "70-200mm"), and the maximum aperture as a bare number ("1.4", "3.5"), which matches "f/1.4", "f1.4" and "1:1.4" alike.
${BRAND_RULE}
- Add the lens line or mount only when it is one short word sellers actually write (FD, EF, MD, Rokkor, Takumar, Zuiko, Summicron). Expand catalogue abbreviations to what sellers write: "FDn" is "FD", "LSM" is left out.
- Leave out everything a seller would not type: version markers such as [I], [II], "Type 2", "Gen. X", "Gold", "electric", "for FTL", trade names like S.S.C. or T*, "ED-IF", "| C", and the word "lens".`;

const CAMERA_RULES = `- Two to five words: the brand and the model name as sellers on eBay's US site write it ("Rebel T6i", "M50 Mark II", "A77 II", "Maxxum 7D", "M6").
${BRAND_RULE}
- Where a body was sold under different names in different markets, use the US name: "Rebel T6i" not "750D" or "Kiss X8i", "Maxxum" not "Dynax", "EVOLT" left out.
- Keep an edition or finish that sellers do write and that tells this body apart (Titanium, Safari, Millennium). Drop what they do not: "(Typ 2248)", "Professional", the lens a body shipped with.
- Leave out the words "camera" and "body".`;

export async function writeSearchKeywords(
  kind: "lens" | "camera",
  name: string,
): Promise<string | null> {
  const thing = kind === "lens" ? "lens" : "camera body";
  const prompt = `Write an eBay keyword search for the ${thing}: "${name}".

eBay only returns listings whose title contains every word of the search, so the search must use words that nearly every seller of this exact ${thing} would type in the title, and nothing else. This search is only run when the catalogue name above found no listings at all.

Rules:
${kind === "lens" ? LENS_RULES : CAMERA_RULES}
${NO_INVENTION_RULE}
- Do not begin any word with "-".

Return only the keywords.`;

  try {
    const { output } = await generateText({
      model: "google/gemini-3.1-flash-lite",
      output: Output.object({ schema: KeywordsSchema }),
      prompt,
      timeout: 30_000,
    });
    return cleanSearchKeywords(output?.keywords);
  } catch (error) {
    console.error(`[ebay-search-keywords] ${kind} "${name}":`, error);
    return null;
  }
}
