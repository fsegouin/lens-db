import { sql, type SQL, type AnyColumn } from "drizzle-orm";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "EF 50" should match "EF 50mm", so a one-or-two-letter token followed by a
 * number is matched as one adjacent unit. The reverse (number then letters) is
 * deliberately not merged: it broke "24-70 gm", where the tokens are words
 * apart in the real name.
 */
function shouldMergeModelFragments(a: string, b: string): boolean {
  return /^[a-zA-Z]{1,2}$/.test(a) && /^\d[\d.]*$/.test(b);
}

/**
 * Split a query the way people type lens names. Punctuation is a separator,
 * not noise: "24-70" becomes two tokens so it can match "24-70mm", and
 * "helios 44-2" can match "Helios-44-2".
 */
function tokenize(query: string): string[] {
  return query
    .trim()
    .split(/[^a-zA-Z0-9.]+/)
    .filter(Boolean)
    .slice(0, 10)
    .map((w) => w.replace(/\.+$/, ""))
    .filter(Boolean);
}

/** Split a token wherever letters meet digits: "50mm" -> ["50", "mm"]. */
function splitAtCaseChanges(token: string): string[] {
  return token.split(/(?<=[a-zA-Z])(?=[0-9])|(?<=[0-9.])(?=[a-zA-Z])/);
}

/**
 * Makers punctuate model designations however they like, and people type them
 * without the punctuation: "Nikon Z 9" gets typed "z9", "Fujifilm X-T5" (which
 * normalizes to "X T5") gets typed "xt5", "Sony a7 IV" gets typed "a7iv". For a
 * token mixing letters and digits, allow optional whitespace between every
 * character so any spelling finds them all. Only whitespace may sit between the
 * parts, so this stays tight: "xt5" cannot reach across "X Mark III".
 *
 * Other tokens split only where letters meet digits, so "50mm" still matches
 * "50 mm" while "nikon" cannot match a word it merely shares letters with. A
 * decimal survives either way, because "." rides with the digits.
 */
function tokenPattern(token: string): string {
  const isModelDesignation = /[a-zA-Z]/.test(token) && /[0-9]/.test(token);
  const parts = isModelDesignation ? token.split("") : splitAtCaseChanges(token);
  return parts.filter(Boolean).map(escapeRegex).join("\\s*");
}

/**
 * A token starting with a digit must begin a word, so "35" does not match
 * inside "135". The optional f/F lets a bare "1.4" match "F/1.4", the way
 * photographers actually type an aperture.
 */
function toPattern(token: string, merged: string | null): string {
  const body = merged ?? tokenPattern(token);
  return /^\d/.test(token) ? `\\m[fF]?${body}` : body;
}

function buildPatterns(query: string): string[] {
  const words = tokenize(query);
  const patterns: string[] = [];
  let i = 0;

  while (i < words.length) {
    if (i + 1 < words.length && shouldMergeModelFragments(words[i], words[i + 1])) {
      patterns.push(
        toPattern(
          words[i],
          `${tokenPattern(words[i])}\\s*${tokenPattern(words[i + 1])}`,
        ),
      );
      i += 2;
    } else {
      patterns.push(toPattern(words[i], null));
      i++;
    }
  }

  return patterns;
}

/**
 * Punctuation in a stored name becomes a space so that "Helios-44-2" is three
 * words rather than one. Both the SQL and in-process matchers must normalize
 * the same way or the typeahead and the list page disagree.
 */
const NORMALIZE_NAME_SQL = "[^a-zA-Z0-9. ]";

export function normalizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9. ]/g, " ");
}

// In-process mirror of buildNameSearch, used by the typeahead's cached index.
export function buildNameMatchers(query: string): RegExp[] {
  // \m in Postgres is a word-start boundary; \b here only matches when the
  // digit is not preceded by a word character, which is the same thing.
  return buildPatterns(query).map(
    (p) => new RegExp(p.replace(/^\\m/, "\\b"), "i"),
  );
}

export function matchesNormalizedName(
  value: string | null | undefined,
  matchers: RegExp[],
): boolean {
  if (!value) return false;
  const normalized = normalizeName(value);
  return matchers.every((m) => m.test(normalized));
}

export function buildNameSearch(column: AnyColumn, query: string): SQL[] {
  return buildPatterns(query).map(
    (pattern) =>
      sql`regexp_replace(${column}, ${NORMALIZE_NAME_SQL}, ' ', 'g') ~* ${pattern}`,
  );
}
