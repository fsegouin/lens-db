import { sql, type SQL, type AnyColumn } from "drizzle-orm";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldMergeModelFragments(a: string, b: string): boolean {
  const aIsShortAlpha = /^[a-zA-Z]{1,2}$/.test(a);
  const bIsNumeric = /^\d[\d.]*$/.test(b);
  const bIsShortAlpha = /^[a-zA-Z]{1,2}$/.test(b);
  const aIsNumeric = /^\d[\d.]*$/.test(a);
  return (aIsShortAlpha && bIsNumeric) || (aIsNumeric && bIsShortAlpha);
}

// In-process mirror of buildNameSearch: same word cleaning, model-fragment
// merging, and digit word-start boundary (\m in Postgres, \b here — both
// only match a boundary when the digit is not preceded by a word char).
export function buildNameMatchers(query: string): RegExp[] {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  const cleaned = words
    .map((w) => w.replace(/[^a-zA-Z0-9.]/g, ""))
    .filter(Boolean);

  const matchers: RegExp[] = [];
  let i = 0;

  while (i < cleaned.length) {
    let pattern: string;
    const first = cleaned[i];
    if (
      i + 1 < cleaned.length &&
      shouldMergeModelFragments(cleaned[i], cleaned[i + 1])
    ) {
      pattern = `${escapeRegex(cleaned[i])}\\s*${escapeRegex(cleaned[i + 1])}`;
      i += 2;
    } else {
      pattern = escapeRegex(cleaned[i]);
      i++;
    }
    if (/^\d/.test(first)) pattern = `\\b${pattern}`;
    matchers.push(new RegExp(pattern, "i"));
  }

  return matchers;
}

// Mirror of the SQL-side regexp_replace normalization before matching.
export function matchesNormalizedName(
  value: string | null | undefined,
  matchers: RegExp[],
): boolean {
  if (!value) return false;
  const normalized = value.replace(/[^a-zA-Z0-9. ]/g, "");
  return matchers.every((m) => m.test(normalized));
}

export function buildNameSearch(column: AnyColumn, query: string): SQL[] {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  const cleaned = words
    .map((w) => w.replace(/[^a-zA-Z0-9.]/g, ""))
    .filter(Boolean);

  const conditions: SQL[] = [];
  let i = 0;

  while (i < cleaned.length) {
    if (
      i + 1 < cleaned.length &&
      shouldMergeModelFragments(cleaned[i], cleaned[i + 1])
    ) {
      const merged = `${escapeRegex(cleaned[i])}\\s*${escapeRegex(cleaned[i + 1])}`;
      const pattern = /^\d/.test(cleaned[i]) ? `\\m${merged}` : merged;
      conditions.push(
        sql`regexp_replace(${column}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
      i += 2;
    } else {
      const escaped = escapeRegex(cleaned[i]);
      const pattern = /^\d/.test(cleaned[i]) ? `\\m${escaped}` : escaped;
      conditions.push(
        sql`regexp_replace(${column}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
      i++;
    }
  }

  return conditions;
}
