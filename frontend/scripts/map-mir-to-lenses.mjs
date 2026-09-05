/**
 * Match a mir.com.my crawl (scraper/mir-nikkor-scrape.mjs) against our Nikon
 * rows and report what it could fill in.
 *
 * Matching is on optics, not names: a page's focal length and maximum aperture
 * pick the candidate set, then designation tokens from the page title break
 * the tie ("QD.C" and "Auto" pull "Nikkor-QD[·C] Auto 15mm F/5.6" ahead of
 * "AI Nikkor 15mm F/5.6"). Names alone would never line up, because mir writes
 * the mid-dot as a full stop and puts the focal length first.
 *
 * Nothing is written. The output is a proposal: which lens row each page maps
 * to, and which of our empty columns that page has a value for.
 *
 * Usage (from frontend/):
 *   node scripts/map-mir-to-lenses.mjs ../scraper/mir-nikkor.json
 *   node scripts/map-mir-to-lenses.mjs ../scraper/mir-nikkor.json --md out.md
 *   node scripts/map-mir-to-lenses.mjs ../scraper/mir-nikkor.json --json out.json
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
const file = args.find((a) => !a.startsWith("--"));
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const mdOut = argVal("--md");
const jsonOut = argVal("--json");
if (!file) {
  console.error("usage: node scripts/map-mir-to-lenses.mjs <crawl.json> [--md out.md] [--json out.json]");
  process.exit(1);
}
const crawl = JSON.parse(readFileSync(resolve(file), "utf8"));

// ---------------------------------------------------------------------------
// Pull typed values out of mir's spec strings
// ---------------------------------------------------------------------------

const num = (m) => (m ? parseFloat(m[1]) : null);

// "3,650g (128.7 oz)", "17,500g" and "2 kg (4.4 lb)" all appear; a bare \d+
// regex reads 650. (No \b after the group: in "17,500g" the digit runs
// straight into the unit, so there is no word boundary to anchor on.)
function parseWeight(text) {
  if (!text) return null;
  const t = text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const kg = t.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kg) return Math.round(parseFloat(kg[1]) * 1000);
  return num(t.match(/(\d+(?:\.\d+)?)\s*g\b/i));
}

function parseMir(page) {
  const s = page.specs ?? {};
  // Only 63 of 116 spec blocks name the focal length and 45 the aperture, but
  // a single-lens page title always does ("Reflex-Nikkor 2000mm f/11 Lens").
  // An index page title names one member of a family the block may not be
  // about, so it is not a safe fallback there.
  const titleFallback = page.isIndex ? "" : (page.title ?? "");
  const construction = (s["Lens construction"] ?? "").match(/(\d+)\s*elements?\s*in\s*(\d+)\s*groups?/i);
  // Zooms are written "80~200mm" (and occasionally "80-200mm").
  const focalText = s["Focal length"] ?? titleFallback;
  const range = focalText.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)\s*mm/i);
  return {
    focal: range ? parseFloat(range[1]) : num(focalText.match(/(\d+(?:\.\d+)?)\s*mm/i)),
    focalMax: range ? parseFloat(range[2]) : null,
    // mir writes "1:5.6" or "f/5.6"
    aperture: num((s["Maximum aperture"] ?? titleFallback).match(/(?:1:|f\/)\s*(\d+(?:\.\d+)?)/i)),
    elements: construction ? parseInt(construction[1], 10) : null,
    groups: construction ? parseInt(construction[2], 10) : null,
    weightG: parseWeight(s["Weight"]),
    filterMm: num((s["Attachment size"] ?? s["Filter"] ?? "").match(/(\d+(?:\.\d+)?)\s*mm/i)),
    minFocusM: num((s["Distance scale"] ?? s["Closest focusing distance"] ?? "").match(/(\d+(?:\.\d+)?)\s*m\b/i)),
    blades: num((s["Number of diaphragm blades"] ?? "").match(/(\d+)/)),
    year: page.introYear,
  };
}

// "15mm f/5.6 -QD.C Non-Ai Nikkor Lens" → qdc, nonai, nikkor
const STOP = new Set(["lens", "lenses", "mm", "the", "and", "for", "with", "nikon", "nikkor", "version", "page"]);
function tokens(text) {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/[·.]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

const sql = createSql();
try {
  const lenses = await sql`
    select l.id, l.name, l.slug, l.year_introduced, l.focal_length_min, l.focal_length_max,
           l.aperture_min, l.lens_elements, l.lens_groups, l.weight_g, l.filter_size_mm,
           l.min_focus_distance_m, l.diaphragm_blades,
           length(coalesce(l.description, '')) as desc_len,
           jsonb_array_length(coalesce(l.images, '[]'::jsonb)) as n_images
    from lenses l
    where l.merged_into_id is null and l.brand ilike 'nikon%'
  `;

  const pages = crawl.pages.filter((p) => Object.keys(p.specs ?? {}).length >= 4);
  const results = [];

  for (const page of pages) {
    const mir = parseMir(page);
    if (!mir.focal || !mir.aperture) continue;
    // Index pages cover a whole family; a year found in their prose cannot be
    // attributed to one member, so it is not evidence for or against a row.
    const singleModel = !page.isIndex && (page.models?.length ?? 0) <= 2;
    if (!singleModel) mir.year = null;

    const wantMax = mir.focalMax ?? mir.focal;
    const candidates = lenses.filter(
      (l) =>
        Number(l.focal_length_min) === mir.focal &&
        (l.focal_length_max == null || Number(l.focal_length_max) === wantMax) &&
        Math.abs(Number(l.aperture_min) - mir.aperture) < 0.06,
    );
    if (!candidates.length) {
      results.push({ page: page.url, title: page.title, mir, match: null, reason: "no lens with that focal/aperture" });
      continue;
    }

    const pageTokens = tokens(page.title);
    const scored = candidates
      .map((l) => {
        const lensTokens = tokens(l.name);
        let score = 0;
        for (const t of pageTokens) if (lensTokens.has(t)) score += 2;
        // Optical construction agreeing is stronger evidence than any word.
        if (mir.elements && l.lens_elements === mir.elements) score += 3;
        if (mir.weightG && l.weight_g && Math.abs(l.weight_g - mir.weightG) <= 10) score += 2;
        if (mir.year && l.year_introduced === mir.year) score += 2;
        return { lens: l, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const runnerUp = scored[1];
    const confident = best.score >= 3 && (!runnerUp || best.score > runnerUp.score);

    const fills = [];
    if (confident) {
      const l = best.lens;
      if (l.lens_elements == null && mir.elements) fills.push(`lens_elements=${mir.elements}`);
      if (l.lens_groups == null && mir.groups) fills.push(`lens_groups=${mir.groups}`);
      if (l.weight_g == null && mir.weightG) fills.push(`weight_g=${mir.weightG}`);
      if (l.filter_size_mm == null && mir.filterMm) fills.push(`filter_size_mm=${mir.filterMm}`);
      if (l.min_focus_distance_m == null && mir.minFocusM) fills.push(`min_focus_distance_m=${mir.minFocusM}`);
      if (l.diaphragm_blades == null && mir.blades) fills.push(`diaphragm_blades=${mir.blades}`);
      if (l.year_introduced == null && mir.year) fills.push(`year_introduced=${mir.year}`);
    }

    // A value we already hold that mir contradicts is worth a human's time.
    const conflicts = [];
    if (confident) {
      const l = best.lens;
      if (l.lens_elements != null && mir.elements && l.lens_elements !== mir.elements)
        conflicts.push(`lens_elements ${l.lens_elements} vs mir ${mir.elements}`);
      if (l.weight_g != null && mir.weightG && Math.abs(l.weight_g - mir.weightG) > 25)
        conflicts.push(`weight_g ${l.weight_g} vs mir ${mir.weightG}`);
      if (l.year_introduced != null && mir.year && Math.abs(l.year_introduced - mir.year) > 1)
        conflicts.push(`year ${l.year_introduced} vs mir ${mir.year}`);
    }

    results.push({
      page: page.url,
      singleModel,
      title: page.title,
      mir,
      match: confident ? { id: best.lens.id, name: best.lens.name, slug: best.lens.slug, score: best.score } : null,
      alternatives: confident ? [] : scored.slice(0, 4).map((s) => `${s.lens.name} (${s.score})`),
      reason: confident ? null : "ambiguous, several versions score the same",
      fills,
      conflicts,
      images: page.images?.length ?? 0,
    });
  }

  const matched = results.filter((r) => r.match);
  const withFills = matched.filter((r) => r.fills.length);
  const withConflicts = matched.filter((r) => r.conflicts.length);
  const distinctLenses = new Set(matched.map((r) => r.match.id));

  console.log(`mir pages with a usable spec block: ${pages.length}`);
  console.log(`  matched to a lens row with confidence: ${matched.length} (${distinctLenses.size} distinct lenses)`);
  console.log(`  of those, filling at least one empty column: ${withFills.length}`);
  console.log(`  of those, contradicting a value we already hold: ${withConflicts.length}`);
  console.log(`  unmatched or ambiguous: ${results.length - matched.length}`);
  console.log(
    `\nColumns fillable across all matches: ` +
      Object.entries(
        withFills
          .flatMap((r) => r.fills.map((f) => f.split("=")[0]))
          .reduce((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {}),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(", "),
  );

  if (jsonOut) {
    writeFileSync(resolve(jsonOut), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  if (mdOut) {
    const lines = [
      "# mir.com.my mapped onto our Nikon rows",
      "",
      `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/map-mir-to-lenses.mjs\`, read-only.`,
      "",
      `- mir pages carrying a usable spec block: **${pages.length}**`,
      `- Matched to one of our lens rows: **${matched.length}** (**${distinctLenses.size}** distinct lenses)`,
      `- Matches that would fill an empty column: **${withFills.length}**`,
      `- Matches that contradict a value we hold: **${withConflicts.length}**`,
      `- Unmatched or ambiguous: **${results.length - matched.length}**`,
      "",
      `## Would fill empty columns: ${withFills.length}`,
      "",
    ];
    for (const r of withFills) {
      lines.push(`- **${r.match.name}** (id ${r.match.id})`);
      lines.push(`  - ${r.fills.join(", ")}`);
      lines.push(`  - ${r.page}`);
    }
    lines.push("", `## Contradicts what we hold: ${withConflicts.length}`, "");
    for (const r of withConflicts) {
      lines.push(`- **${r.match.name}** (id ${r.match.id})`);
      for (const c of r.conflicts) lines.push(`  - ${c}`);
      lines.push(`  - ${r.page}`);
    }
    const ambiguous = results.filter((r) => !r.match);
    lines.push("", `## Unmatched or ambiguous: ${ambiguous.length}`, "");
    for (const r of ambiguous) {
      lines.push(`- ${r.title ?? r.page}: ${r.reason}`);
      if (r.alternatives?.length) lines.push(`  - candidates: ${r.alternatives.join(", ")}`);
    }
    writeFileSync(resolve(mdOut), lines.join("\n"));
    console.log(`\nWrote ${mdOut}`);
  }
} finally {
  await sql.end();
}
