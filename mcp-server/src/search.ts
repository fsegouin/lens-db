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
