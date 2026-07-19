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
