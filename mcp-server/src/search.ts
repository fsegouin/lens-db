function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escape PostgreSQL LIKE/ILIKE metacharacters in a value so it can be
 * safely interpolated into a pattern. Drizzle's tagged template handles
 * SQL injection — this guards against pattern injection (e.g. a value
 * containing `%` or `_`).
 */
export function escapeLikeMetachars(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function shouldMergeModelFragments(a: string, b: string): boolean {
  const aIsShortAlpha = /^[a-zA-Z]{1,2}$/.test(a);
  const bIsNumeric = /^\d[\d.]*$/.test(b);
  const bIsShortAlpha = /^[a-zA-Z]{1,2}$/.test(b);
  const aIsNumeric = /^\d[\d.]*$/.test(a);
  return (aIsShortAlpha && bIsNumeric) || (aIsNumeric && bIsShortAlpha);
}

/**
 * Build regex patterns from a free-text query. May return an empty array
 * when every word is stripped (non-Latin text, symbols) — callers MUST
 * treat an empty result for a non-empty query as "no matches" rather than
 * dropping the filter.
 */
export function buildSearchPatterns(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  const cleaned = words
    .map((w) => w.replace(/[^a-zA-Z0-9.]/g, ""))
    .filter(Boolean);

  const patterns: string[] = [];
  let i = 0;

  while (i < cleaned.length) {
    if (
      i + 1 < cleaned.length &&
      shouldMergeModelFragments(cleaned[i], cleaned[i + 1])
    ) {
      const merged = `${escapeRegex(cleaned[i])}\\s*${escapeRegex(cleaned[i + 1])}`;
      patterns.push(/^\d/.test(cleaned[i]) ? `\\m${merged}` : merged);
      i += 2;
    } else {
      const escaped = escapeRegex(cleaned[i]);
      patterns.push(/^\d/.test(cleaned[i]) ? `\\m${escaped}` : escaped);
      i++;
    }
  }

  return patterns;
}
