import { repairDescription } from "./description-whitespace";

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

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Within each section, split very long blocks (>500 chars) on sentence boundaries
    // to create readable paragraphs
    if (trimmed.length > 500) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g) || [trimmed];
      let current = "";
      for (const sentence of sentences) {
        current += sentence;
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

  // Clean up each paragraph
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}
