import { generateText, Output } from "ai";
import { z } from "zod";
import { cleanLensKeywords } from "./ebay-search-query.ts";

/**
 * Ask a model for the words an eBay seller would put in a title for a lens.
 *
 * The Browse API is a strict AND over every word of the query, and the
 * catalogue writes names sellers never do: "[II]", "Gen. X", "Type 2", "FDn",
 * "F/1L", "| C". On the first asking-price sweep half the lens catalogue found
 * no listing at all, including lenses with dozens of recorded sales, because
 * one of those words was in the query. A hand-written reducer would have to
 * know that "FDn" means "New FD" and that "LSM" sellers write as "L39" or
 * "LTM"; the model already does.
 *
 * Recall is the goal here, not precision. The classifier that judges every
 * listing against the full catalogue name is what keeps a loose query from
 * pricing a lens off its neighbours, so the query only has to find the lens's
 * listings among others, never to exclude them.
 */

const KeywordsSchema = z.object({
  keywords: z
    .string()
    .describe("Three to six words, no punctuation beyond what is inside a number."),
});

export async function writeLensSearchKeywords(name: string): Promise<string | null> {
  const prompt = `Write an eBay keyword search for the lens: "${name}".

eBay only returns listings whose title contains every word of the search, so the search must use words that nearly every seller of this exact lens would type in the title, and nothing else. This search is only run when the catalogue name above found no listings at all.

Rules:
- Three to six words: the brand, the focal length as sellers write it ("50mm", "70-200mm"), and the maximum aperture as a bare number ("1.4", "3.5"), which matches "f/1.4", "f1.4" and "1:1.4" alike.
- The brand is the one buyers search by: Pentax not Asahi, Nikon not Nippon Kogaku, Leica not Leitz Wetzlar or Leitz Canada, Zeiss not Carl Zeiss.
- Add the lens line or mount only when it is one short word sellers actually write (FD, EF, MD, Rokkor, Takumar, Zuiko, Summicron). Expand catalogue abbreviations to what sellers write: "FDn" is "FD", "LSM" is left out.
- Leave out everything a seller would not type: version markers such as [I], [II], "Type 2", "Gen. X", "Gold", "electric", "for FTL", trade names like S.S.C. or T*, "ED-IF", "| C", and the word "lens".
- Do not begin any word with "-".

Return only the keywords.`;

  try {
    const { output } = await generateText({
      model: "google/gemini-3.1-flash-lite",
      output: Output.object({ schema: KeywordsSchema }),
      prompt,
      timeout: 30_000,
    });
    return cleanLensKeywords(output?.keywords);
  } catch (error) {
    console.error(`[ebay-lens-keywords] "${name}":`, error);
    return null;
  }
}
