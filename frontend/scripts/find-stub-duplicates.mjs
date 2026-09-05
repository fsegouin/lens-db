/**
 * Find the duplicates that name normalisation cannot see.
 *
 * Every dedupe pass so far compared *name strings*: scraper/find_duplicates.py
 * groups on a canonical name (brackets folded to parens, C/Y prefix stripped),
 * and the September 2026 pass added token-reordering. Both are exact-string
 * rules, so they only catch rows whose names are the same words in a different
 * order or with different punctuation.
 *
 * They are blind to the biggest remaining cohort: rows imported from a second
 * lens-db.com index that used a different naming convention for the same
 * product. "Nikon AF Zoom-Nikkor 24-50mm F/3.3-4.5" and "Nikon AF Nikkor
 * 24-50mm F/3.3-4.5" are one lens; so are "Nikon Nikkor-QD·C 15mm F/5.6" and
 * "Nikon Nikkor-QD[·C] Auto 15mm F/5.6", "Fuji EBC Fujinon-T 400mm F/4.5" and
 * "Fuji Photo Film EBC Fujinon-T 400mm F/4.5", "Yashica Auto Yashicor 200mm
 * F/3.5" and "Yashica Auto Yashikor 200mm F/3.5". No string rule joins those
 * without also merging genuinely distinct versions.
 *
 * What identifies them is not the name, it is the *shape of the row*. Those
 * imports all landed with the thin lens-db.com spec template (a "Mount" /
 * "Announced" / "Anti-reflection coating" block instead of the full one), no
 * description, and no optical construction. This script finds those stubs and
 * pairs each with the fully-populated rows that share its brand, mount, focal
 * length and maximum aperture.
 *
 * The output is a REVIEW QUEUE, not an auto-merge list: for a family like the
 * Nikon 15mm f/5.6 the same key covers four rows, three of which are real
 * versions (Nikkor-QD·C Auto, New Nikkor, AI Nikkor). Resolve each with
 * merge-lenses.mjs.
 *
 * Usage (from frontend/):
 *   node scripts/find-stub-duplicates.mjs                  # summary to stdout
 *   node scripts/find-stub-duplicates.mjs --md out.md      # write the review queue
 *   node scripts/find-stub-duplicates.mjs --json out.json
 */

import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const mdOut = argVal("--md");
const jsonOut = argVal("--json");

const sql = createSql();

// The thin lens-db.com template. "Anti-reflection coating" is the tell: the
// full template never has it, and it is present on every row of this cohort.
const stubPredicate = (t) => `
  ${t}.specs ? 'Anti-reflection coating'
  AND coalesce(${t}.description, '') = ''
  AND ${t}.lens_elements IS NULL
`;

try {
  const stubs = await sql.unsafe(`
    SELECT l.id, l.name, l.slug, l.brand, l.system_id, l.year_introduced,
           l.focal_length_min, l.focal_length_max, l.aperture_min
    FROM lenses l
    WHERE l.merged_into_id IS NULL AND ${stubPredicate("l")}
    ORDER BY l.brand, l.name
  `);

  const siblings = await sql.unsafe(`
    SELECT s.id AS stub_id,
           f.id, f.name, f.slug, f.year_introduced, f.weight_g,
           f.lens_elements, f.lens_groups,
           length(coalesce(f.description, '')) AS desc_len,
           jsonb_array_length(coalesce(f.images, '[]'::jsonb)) AS n_images
    FROM lenses s
    JOIN lenses f
      ON f.merged_into_id IS NULL
     AND f.id <> s.id
     AND f.system_id = s.system_id
     AND f.brand = s.brand
     AND f.focal_length_min IS NOT DISTINCT FROM s.focal_length_min
     AND f.focal_length_max IS NOT DISTINCT FROM s.focal_length_max
     AND f.aperture_min IS NOT DISTINCT FROM s.aperture_min
     AND f.lens_elements IS NOT NULL
    WHERE s.merged_into_id IS NULL AND ${stubPredicate("s")}
    ORDER BY s.id, f.id
  `);

  const byStub = new Map();
  for (const row of siblings) {
    if (!byStub.has(row.stub_id)) byStub.set(row.stub_id, []);
    byStub.get(row.stub_id).push(row);
  }

  // One candidate sibling is a decision; a dozen is a family that needs a
  // human to pick the right member, so rank the unambiguous ones first.
  const groups = stubs
    .filter((s) => byStub.has(s.id))
    .map((s) => ({ stub: s, candidates: byStub.get(s.id) }))
    .sort((a, b) => a.candidates.length - b.candidates.length || a.stub.id - b.stub.id);

  const single = groups.filter((g) => g.candidates.length === 1);
  const orphans = stubs.filter((s) => !byStub.has(s.id));

  console.log(`Live lenses matching the thin lens-db.com template: ${stubs.length}`);
  console.log(`  with at least one fully-populated sibling of identical optics: ${groups.length}`);
  console.log(`  of those, exactly one candidate (decidable at a glance): ${single.length}`);
  console.log(`  no sibling, so probably a genuine thin record: ${orphans.length}`);

  if (jsonOut) {
    writeFileSync(resolve(jsonOut), JSON.stringify(groups, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  if (mdOut) {
    const fmt = (r) =>
      `id ${r.id} · ${r.slug} · ${r.year_introduced ?? "year unknown"}` +
      (r.lens_elements ? ` · ${r.lens_elements}/${r.lens_groups ?? "?"}` : "") +
      (r.weight_g ? ` · ${r.weight_g}g` : "") +
      (r.n_images ? ` · ${r.n_images} img` : "") +
      (r.desc_len ? ` · ${r.desc_len} char description` : "");

    const lines = [
      "# Stub duplicate review queue",
      "",
      `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/find-stub-duplicates.mjs\`, read-only.`,
      "",
      `- Live lenses on the thin lens-db.com spec template: **${stubs.length}**`,
      `- With a fully-populated sibling of identical brand, mount, focal length and aperture: **${groups.length}**`,
      `- Exactly one candidate: **${single.length}**`,
      `- No sibling: **${orphans.length}**`,
      "",
      "Name normalisation cannot reach these: the two rows are the same product",
      "under two different naming conventions, so folding them by string would",
      "also fold genuinely distinct versions. Each entry below needs a decision.",
      "",
      `## One candidate: ${single.length} groups`,
      "",
    ];
    for (const g of single) {
      lines.push(`### ${g.stub.name}`);
      lines.push(`- STUB   ${fmt({ ...g.stub, desc_len: 0, n_images: 0 })}`);
      lines.push(`- keeper ${g.candidates[0].name}`);
      lines.push(`         ${fmt(g.candidates[0])}`);
      lines.push("");
    }

    const many = groups.filter((g) => g.candidates.length > 1);
    lines.push(`## Several candidates: ${many.length} groups, pick the right version`, "");
    for (const g of many) {
      lines.push(`### ${g.stub.name}`);
      lines.push(`- STUB   ${fmt({ ...g.stub, desc_len: 0, n_images: 0 })}`);
      for (const c of g.candidates) {
        lines.push(`- cand   ${c.name}`);
        lines.push(`         ${fmt(c)}`);
      }
      lines.push("");
    }

    writeFileSync(resolve(mdOut), lines.join("\n"));
    console.log(`\nWrote ${mdOut}`);
  }
} finally {
  await sql.end();
}
