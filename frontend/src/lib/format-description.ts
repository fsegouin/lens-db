// The .ts extension lets `node --test` load this file without a bundler.
import { repairDescription } from "./description-whitespace.ts";

/**
 * Cleans up messy lens/camera descriptions (often raw press release dumps)
 * and splits them into readable paragraphs.
 */
export function formatDescription(raw: string): string[] {
  let text = raw;

  // Remove footnote markers like *1, *2 etc.
  text = text.replace(/\*\d+/g, "");

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

  // First, split on likely section boundaries
  const sections = text.split(
    /(?=(?:Primary features|Key features|Main features|Features|Specifications|Primary specifications):|(?:TOKYO|NEW YORK|VALHALLA|MELVILLE)\s*[-–—]\s*)/i
  );

  // A blank line is an author's paragraph break, and text that has any is
  // shown with the paragraphs its author chose. A single newline is not a
  // break: imported text wraps mid-sentence at the width of the page it was
  // scraped from. A block nobody would write as one paragraph (a few scraped
  // rows carry a blank line and then thousands of characters) is still split.
  const authored = /\n[ \t]*\n/.test(text);
  const splitAbove = authored ? 1500 : 500;

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
