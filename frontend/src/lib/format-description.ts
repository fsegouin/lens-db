// The .ts extension lets `node --test` load this file without a bundler.
import { repairDescription } from "./description-whitespace.ts";

/**
 * Cleans up messy lens/camera descriptions (often raw press release dumps)
 * and splits them into readable paragraphs.
 */
export function formatDescription(raw: string): string[] {
  let text = raw;

  // Remove footnote markers like *1, *2 etc.
  //
  // A marker is an asterisk and one or two digits. Both halves of that are
  // load-bearing. A bare `\*\d+` also matched the "*1" of the Zeiss coating
  // mark "T*1,4/50" and printed it as "T,4/50", and it matched the "*300" of
  // "***300mm focal length" and printed "**mm"; the lookbehind and the
  // two-digit ceiling leave both alone.
  //
  // A marker that sits between two words is replaced by a space rather than by
  // nothing, since the import had already deleted the space around it:
  // "(brightest)*2in Nikon history" is "(brightest) in Nikon history", not
  // "(brightest)in Nikon history".
  text = text.replace(/(?<![Tt*])\*\d{1,2}(?!\d)(?=[A-Za-z])/g, " ");
  text = text.replace(/(?<![Tt*])\*\d{1,2}(?!\d)/g, "");
  // A marker that was parenthesised on its own leaves an empty pair behind.
  text = text.replace(/\(\s*\)/g, "");

  // Restore the spaces the lens-db.com import deleted at every inline-tag
  // boundary. This used to be two bare regexes here, `([.;:])([A-Za-z])` and
  // `([a-z])([A-Z])`, which split every internal capital they met and so
  // rendered "GmbH" as "Gmb H", "eBAND" as "e BAND", "SteadyShot" as
  // "Steady Shot" and the glass code "LaK9" as "La K9". repairDescription
  // knows which joins are names and leaves those alone.
  text = repairDescription(text);

  // Split into paragraphs on common press release patterns:
  // - "Primary features:" or "Key features:" style headers
  // - Dates like "October 10, 2019" appearing mid-text (likely section breaks)
  // - Lines starting with bullet-like patterns
  const paragraphs: string[] = [];

  // First, split on likely section boundaries.
  //
  // The lookahead has to reject a header it is standing in the middle of.
  // Because the pattern is zero-width and case-insensitive, "Primary features:"
  // matched twice — once before "Primary" and again before "features:" — and
  // the second match cut the header in half, leaving a paragraph that read
  // "Primary" and another that began "features:".
  const sections = text.split(
    /(?<!\b(?:Primary|Key|Main|Additional)[ \t])(?=(?:Primary features|Key features|Main features|Features|Specifications|Primary specifications):|(?:TOKYO|NEW YORK|VALHALLA|MELVILLE)\s*[-–—]\s*)/i
  );

  // A blank line is an author's paragraph break, and text that has any is
  // shown with the paragraphs its author chose. A single newline is not a
  // break: imported text wraps mid-sentence at the width of the page it was
  // scraped from. A block nobody would write as one paragraph (a few scraped
  // rows carry a blank line and then thousands of characters) is still split.
  //
  // The ceiling on "a paragraph its author chose" is a thousand characters.
  // It used to be fifteen hundred, which was fine while every blank line in
  // the corpus came from a person. scripts/apply-runon-lists.mjs now writes
  // them too, to give a flattened bullet list its items back, and that made
  // whole descriptions count as authored on the strength of a list at the
  // bottom: a lens whose prose was shown as three paragraphs of six hundred
  // characters became one wall of thirteen hundred. Nobody writes those, and
  // the one description in the catalogue that sat in the old gap reads better
  // split.
  const authored = /\n[ \t]*\n/.test(text);
  const splitAbove = authored ? 1000 : 500;

  for (const section of sections) {
    for (const block of section.split(/\n[ \t]*\n/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      // Split very long runs on sentence boundaries to create readable
      // paragraphs.
      if (trimmed.length > splitAbove) {
        // A sentence ends at a full stop, exclamation or question mark that is
        // followed by whitespace. The dot in "0.45m", "f/5.6" or "1:6.6" is not
        // one, and a break there printed "0." at the end of a paragraph and
        // "45m" at the start of the next.
        const sentences = trimmed.split(/(?<=[.!?])\s+(?=\S)/);
        let current = "";
        for (const sentence of sentences) {
          current += (current ? " " : "") + sentence;
          // Create a paragraph break roughly every 400-600 chars at a sentence boundary
          if (current.length > 400) {
            paragraphs.push(current.trim());
            current = "";
          }
        }
        if (current.trim()) {
          paragraphs.push(current.trim());
        }
      } else {
        paragraphs.push(trimmed);
      }
    }
  }

  // Clean up each paragraph
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}
