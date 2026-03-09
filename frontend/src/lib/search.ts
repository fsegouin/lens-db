import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/**
 * Build regex-based word search conditions for a name column.
 * Each word in the query is matched independently, with word-start boundaries
 * for digit-starting words (so "35" doesn't match inside "135").
 * Punctuation is stripped from both the query and the column value.
 */
export function buildNameSearch(column: AnyColumn, query: string): SQL[] {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  const conditions: SQL[] = [];

  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startsWithDigit = /^\d/.test(clean);
    const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
    conditions.push(
      sql`regexp_replace(${column}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
    );
  }

  return conditions;
}
