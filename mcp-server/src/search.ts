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

/**
 * "EF 50" should match "EF 50mm", so a one-or-two-letter token followed by a
 * number is matched as one adjacent unit. The reverse (number then letters) is
 * deliberately not merged: it broke "24-70 gm", where the tokens are words
 * apart in the real name.
 *
 * Keep in sync with frontend/src/lib/search.ts.
 */
function shouldMergeModelFragments(a: string, b: string): boolean {
  return /^[a-zA-Z]{1,2}$/.test(a) && /^\d[\d.]*$/.test(b);
}

/**
 * A token mixing letters and digits is a model designation ("z9", "xt5",
 * "a7iv"); makers punctuate those inconsistently, so allow optional whitespace
 * between every character. Other tokens split only where letters meet digits.
 *
 * Keep in sync with frontend/src/lib/search.ts.
 */
function tokenPattern(token: string): string {
  const isModelDesignation = /[a-zA-Z]/.test(token) && /[0-9]/.test(token);
  const parts = isModelDesignation
    ? token.split("")
    : token.split(/(?<=[a-zA-Z])(?=[0-9])|(?<=[0-9.])(?=[a-zA-Z])/);
  return parts.filter(Boolean).map(escapeRegex).join("\\s*");
}

/**
 * Build regex patterns from a free-text query. May return an empty array
 * when every word is stripped (non-Latin text, symbols) — callers MUST
 * treat an empty result for a non-empty query as "no matches" rather than
 * dropping the filter.
 *
 * Punctuation separates tokens rather than being deleted, so "24-70" matches
 * "24-70mm" and "helios 44-2" matches "Helios-44-2". A token starting with a
 * digit may be preceded by f/F, so a bare "1.4" matches "F/1.4".
 */
export function buildSearchPatterns(query: string): string[] {
  const cleaned = query
    .trim()
    .split(/[^a-zA-Z0-9.]+/)
    .filter(Boolean)
    .slice(0, 10)
    .map((w) => w.replace(/\.+$/, ""))
    .filter(Boolean);

  const patterns: string[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const first = cleaned[i];
    let body: string;
    if (
      i + 1 < cleaned.length &&
      shouldMergeModelFragments(cleaned[i], cleaned[i + 1])
    ) {
      body = `${tokenPattern(cleaned[i])}\\s*${tokenPattern(cleaned[i + 1])}`;
      i += 2;
    } else {
      body = tokenPattern(cleaned[i]);
      i++;
    }
    patterns.push(/^\d/.test(first) ? `\\m[fF]?${body}` : body);
  }

  return patterns;
}
