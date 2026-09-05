/**
 * Match a mir.com.my crawl (scraper/mir-nikkor-scrape.mjs) against our Nikon
 * camera rows and report what it could fill in.
 *
 * The lens mapper keys on optics, which bodies do not have, so this one keys
 * on the model name and reuses `nameMatches` from lib/commons.mjs rather than
 * inventing a fourth name matcher. That helper already refuses a candidate
 * whose name carries a generation marker the query lacks, which is exactly the
 * failure to avoid here: mir has a page per body *and* per variant, so an
 * "FM2/T" page must not land on the FM2, nor an "F2AS" page on the F2.
 *
 * Nothing is written. The output is a proposal.
 *
 * Usage (from frontend/):
 *   node scripts/map-mir-to-cameras.mjs ../scraper/mir-nikkor.json
 *   node scripts/map-mir-to-cameras.mjs ../scraper/mir-nikkor.json --md out.md
 */

import { createSql } from "./lib/db.mjs";
import { nameMatches, tokenize, isSpecialEdition } from "./lib/commons.mjs";
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
  console.error("usage: node scripts/map-mir-to-cameras.mjs <crawl.json> [--md out.md] [--json out.json]");
  process.exit(1);
}
const crawl = JSON.parse(readFileSync(resolve(file), "utf8"));

// mir titles are prose: "Nikon FM3A SLR Camera - Technical Specifications",
// "Nikkormat FT3 Camera - Index Page". Everything after the dash is furniture,
// and so are the words that describe the page rather than the product.
const TITLE_NOISE =
  /\b(slr|camera|cameras|technical|specifications?|specification|index|page|preface|main|modern|classic|series|models?|full|digital|still|underwater|part|one|two|three|instruction|manual|professional|qd|w\/|with)\b/gi;

function clean(text) {
  return text
    .replace(/,\s*(?:19|20)\d{2}\b/g, " ") // "Nikon FG, 1982"
    .replace(TITLE_NOISE, " ")
    .replace(/^\s*(?:the|a|an|for|of)\b/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * mir titles are prose, in a handful of recurring shapes:
 *   "Nikon FM3A SLR Camera - Technical Specifications"
 *   "Main Specifications for Nikkormat FT-2"      (model follows "for")
 *   "Specification - Nikon FM-10"                 (model is the *second* part)
 *   "Nikon N75 QD / F75 QD SLR camera"            (two market names, one body)
 */
function modelsFromTitle(title) {
  if (!title) return [];
  const after = title.match(/\b(?:specifications?|manual|guide|specs)\s+for\s+(.+)/i);
  const source = after ? after[1] : title;
  const out = [];
  // Every dash-separated segment, not just the first: the model is usually in
  // front, but "Specification - Nikon FM-10" puts the furniture there. And
  // "N75 QD / F75 QD" names one body under two markets, of which we file only
  // one, so both alternatives are tried against the database rather than just
  // the first that parses.
  for (const segment of source.split(/\s+[-–—]\s+/)) {
    const parts = segment.split(/\s*\/\s*/);
    const maker = parts[0].match(/^\s*(nikon|nikkormat|nippon kogaku)\b/i)?.[1] ?? "";
    parts.forEach((alternative, i) => {
      // "Nikon F80 / N80": the maker is stated once and applies to both.
      const withMaker = i > 0 && maker && !/^\s*(nikon|nikkormat)/i.test(alternative)
        ? `${maker} ${alternative}`
        : alternative;
      const cleaned = clean(withMaker);
      if (cleaned.length >= 2 && /[a-z]/i.test(cleaned)) out.push(cleaned);
    });
  }
  return [...new Set(out)];
}

const num = (m) => (m ? parseFloat(m[1]) : null);

function parseWeight(text) {
  if (!text) return null;
  const t = text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const kg = t.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kg) return Math.round(parseFloat(kg[1]) * 1000);
  return num(t.match(/(\d+(?:\.\d+)?)\s*g\b/i));
}

const sql = createSql();
try {
  const cameras = await sql`
    select id, name, slug, year_introduced, body_type, shutter_type, weight_g,
           length(coalesce(description, '')) as desc_len,
           jsonb_array_length(coalesce(images, '[]'::jsonb)) as n_images
    from cameras
    where merged_into_id is null
      and (name ilike 'nikon%' or name ilike 'nikkormat%' or name ilike 'nippon kogaku%')
  `;

  // A body page is one whose spec block used the camera vocabulary.
  const pages = crawl.pages.filter((p) => p.kind === "camera" && Object.keys(p.specs ?? {}).length >= 6);
  const results = [];

  for (const page of pages) {
    const models = modelsFromTitle(page.title);
    if (!models.length) {
      results.push({ page: page.url, title: page.title, match: null, reason: "no model name in the title" });
      continue;
    }
    // The first spelling that any row answers to wins.
    const model = models.find((m) => cameras.some((c) => nameMatches(m, c.name))) ?? models[0];

    // Direction matters. nameMatches(query, candidate) tolerates *extra*
    // tokens in the candidate, so asking it both ways lets our shorter row
    // name swallow a longer mir model: that is how "Nikkormat FT" took the
    // FT-2's page and "Nikkormat EL" took the EL-W's. mir names the specific
    // variant, so mir is always the query.
    const hits = cameras.filter((c) => nameMatches(model, c.name));
    if (!hits.length) {
      results.push({ page: page.url, title: page.title, model, match: null, reason: "no camera row of that name" });
      continue;
    }

    // Prefer the row whose name is closest in length: an exact "Nikon FM3A"
    // beats a limited edition that merely contains it.
    hits.sort(
      (a, b) =>
        Number(isSpecialEdition(a.name)) - Number(isSpecialEdition(b.name)) ||
        Math.abs(tokenize(a.name).length - tokenize(model).length) -
          Math.abs(tokenize(b.name).length - tokenize(model).length),
    );
    const best = hits[0];
    const ambiguous = hits.length > 1 && tokenize(hits[0].name).length === tokenize(hits[1].name).length;

    const mirWeight = parseWeight(page.specs["Weight"]);
    const fills = [];
    if (best.weight_g == null && mirWeight) fills.push(`weight_g=${mirWeight}`);
    if (best.shutter_type == null && page.specs["Shutter"]) fills.push("shutter_type (from Shutter)");

    const conflicts = [];
    if (best.weight_g != null && mirWeight && Math.abs(best.weight_g - mirWeight) > 25) {
      conflicts.push(`weight_g ${best.weight_g} vs mir ${mirWeight}`);
    }

    results.push({
      page: page.url,
      title: page.title,
      model,
      match: ambiguous ? null : { id: best.id, name: best.name, slug: best.slug },
      alternatives: hits.slice(0, 4).map((h) => h.name),
      reason: ambiguous ? "several rows match the same name equally well" : null,
      specCount: Object.keys(page.specs).length,
      fills,
      conflicts,
      images: page.images?.length ?? 0,
      creditName: page.creditName,
    });
  }

  const matched = results.filter((r) => r.match);
  const distinct = new Set(matched.map((r) => r.match.id));
  const withFills = matched.filter((r) => r.fills.length);
  const withConflicts = matched.filter((r) => r.conflicts.length);
  const rowsWithoutImages = new Set(cameras.filter((c) => c.n_images === 0).map((c) => c.id));
  const couldIllustrate = matched.filter((r) => rowsWithoutImages.has(r.match.id) && r.images > 0);

  console.log(`Nikon camera rows: ${cameras.length} (${rowsWithoutImages.size} with no image)`);
  console.log(`mir body pages with a spec block: ${pages.length}`);
  console.log(`  matched to a camera row: ${matched.length} (${distinct.size} distinct)`);
  console.log(`  would fill an empty column: ${withFills.length}`);
  console.log(`  contradict a value we hold: ${withConflicts.length}`);
  console.log(`  match a row that has no image, and carry images: ${couldIllustrate.length}`);
  console.log(`  unmatched or ambiguous: ${results.length - matched.length}`);

  if (jsonOut) {
    writeFileSync(resolve(jsonOut), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  if (mdOut) {
    const lines = [
      "# mir.com.my mapped onto our Nikon camera rows",
      "",
      `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/map-mir-to-cameras.mjs\`, read-only.`,
      "",
      `- Nikon camera rows: **${cameras.length}** (**${rowsWithoutImages.size}** with no image)`,
      `- mir body pages carrying a spec block: **${pages.length}**`,
      `- Matched to a camera row: **${matched.length}** (**${distinct.size}** distinct)`,
      `- Would fill an empty column: **${withFills.length}**`,
      `- Contradict a value we hold: **${withConflicts.length}**`,
      `- Unmatched or ambiguous: **${results.length - matched.length}**`,
      "",
      `## Matched: ${matched.length}`,
      "",
    ];
    for (const r of matched) {
      lines.push(`- **${r.match.name}** (id ${r.match.id}) from ${r.specCount} specs`);
      if (r.fills.length) lines.push(`  - fills: ${r.fills.join(", ")}`);
      if (r.conflicts.length) lines.push(`  - conflicts: ${r.conflicts.join(", ")}`);
      lines.push(`  - ${r.page}`);
    }
    const unmatched = results.filter((r) => !r.match);
    lines.push("", `## Unmatched or ambiguous: ${unmatched.length}`, "");
    for (const r of unmatched) {
      lines.push(`- ${r.title ?? r.page}: ${r.reason}`);
      if (r.alternatives?.length) lines.push(`  - candidates: ${r.alternatives.join(", ")}`);
    }
    writeFileSync(resolve(mdOut), lines.join("\n"));
    console.log(`\nWrote ${mdOut}`);
  }
} finally {
  await sql.end();
}
