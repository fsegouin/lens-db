/**
 * Cleans up messy lens/camera descriptions (often raw press release dumps)
 * and splits them into readable paragraphs.
 */
export function formatDescription(raw: string): string[] {
  let text = raw;

  // Remove footnote markers like *1, *2 etc.
  text = text.replace(/\*\d+/g, "");

  // Add space after period/colon/semicolon followed by a letter with no space
  text = text.replace(/([.;:])([A-Za-z])/g, "$1 $2");

  // Fix camelCase-like word joins (lowercase followed by uppercase with no space)
  // e.g. "includingdistortionandspherical" won't be caught by this,
  // but "aberration.In" → already handled above
  // "flaregenerated" style joins: lowercase letter followed by a common word start
  text = text.replace(/([a-z])([A-Z])/g, "$1 $2");

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
