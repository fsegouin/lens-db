/**
 * Match a kenrockwell.com crawl (scraper/kenrockwell-scrape.mjs) against our
 * lens rows: which review is about which of our lenses, which reviews are
 * about lenses we do not have, and what each review could fill in.
 *
 * Matching is on optics, not names. Brand, focal length and maximum aperture
 * pick the candidate rows; then the designation tokens in his title ("AF-S",
 * "G", "AI-s", "VR II", "ASPH"), his years, and his measured weight break the
 * tie between versions. His names never line up with ours character for
 * character: he writes "Nikon 85mm f/1.8 G" for our "Nikon AF-S Nikkor 85mm
 * F/1.8G".
 *
 * Nothing is written. The output is a proposal in three lists.
 *
 * Usage (from frontend/):
 *   node scripts/map-kenrockwell-to-lenses.mjs ../scraper/kenrockwell.json
 *   node scripts/map-kenrockwell-to-lenses.mjs ../scraper/kenrockwell.json --md out.md --json out.json
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
  console.error("usage: node scripts/map-kenrockwell-to-lenses.mjs <crawl.json> [--md out.md] [--json out.json]");
  process.exit(1);
}
const crawl = JSON.parse(readFileSync(resolve(file), "utf8"));

// His directory → the brand names our rows use for the same makers.
const BRANDS = {
  nikon: ["Nikon"],
  canon: ["Canon"],
  sony: ["Sony"],
  fuji: ["Fuji", "Fujifilm"],
  leica: ["Leica", "Leitz"],
  zeiss: ["Carl Zeiss", "Zeiss"],
  contax: ["Carl Zeiss", "Contax", "Yashica"],
  olympus: ["Olympus"],
  pentax: ["Pentax"],
  minolta: ["Minolta"],
  hasselblad: ["Hasselblad"],
  mamiya: ["Mamiya"],
  tamron: ["Tamron"],
  sigma: ["Sigma", "Sigma-Z", "Sigma-XQ"],
  tokina: ["Tokina"],
  voigtlander: ["Voigtländer", "Cosina"],
  rokinon: ["Rokinon", "Samyang"],
  samyang: ["Samyang", "Rokinon"],
};

// ---------------------------------------------------------------------------
// What lens a review is about, from its title
// ---------------------------------------------------------------------------

const num = (m) => (m ? parseFloat(m[1]) : null);

/**
 * "Nikon 85mm f/1.8 G Review", "Canon RF 100~400mm IS USM", "Sony 24-70mm
 * f/2.8 GM II", "LEICA 21mm f/3.4 ASPH". Zooms may carry two apertures
 * ("f/3.5-5.6", "f/5.6~8"); the first is the maximum at the wide end, which is
 * what our aperture_min holds.
 */
function parseTitle(text) {
  const t = (text ?? "").replace(/\s+Review$/i, "").replace(/[~–—]/g, "-");
  const range = t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i);
  const single = t.match(/(\d+(?:\.\d+)?)\s*mm/i);
  // "f/1.8", "F5.6-8", "1:2.8"; not the F of "RF 100mm" or "EF 50mm".
  let aperture = num(t.match(/(?<![a-z0-9])f\/?\s*(\d+(?:\.\d+)?)/i)) ?? num(t.match(/\b1:(\d+(?:\.\d+)?)/));
  // Model numbers glue the aperture in without its dot: "SEL100F28GM" is f/2.8.
  const model = t.match(/\d+F(\d)(\d)(?=[A-Z]|\b)/);
  if (aperture === null && model) aperture = parseFloat(`${model[1]}.${model[2]}`);
  return {
    focal: range ? parseFloat(range[1]) : single ? parseFloat(single[1]) : null,
    focalMax: range ? parseFloat(range[2]) : null,
    aperture,
  };
}

/** Aperture from the file name when the title has none: "50mm-f14.htm" → 1.4, "28mm-f28-ai.htm" → 2.8. */
function apertureFromPath(url) {
  const m = url.match(/-f(\d)(\d)?(?:-|\.htm)/i);
  if (!m) return null;
  return m[2] ? parseFloat(`${m[1]}.${m[2]}`) : parseFloat(m[1]);
}

const STOP = new Set(["nikon", "nikkor", "canon", "sony", "leica", "leitz", "zeiss", "carl", "lens", "review", "the", "mm", "with", "and", "for", "of", "fe", "ef"]);

function tokens(text) {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/ai-s\b/g, "ais")
      .replace(/[·.]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t) && !/^f\d+$/.test(t)),
  );
}

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

const sql = createSql();
try {
  const lenses = await sql`
    select l.id, l.name, l.slug, l.brand, l.year_introduced, l.year_discontinued, l.focal_length_min, l.focal_length_max,
           l.aperture_min, l.lens_elements, l.lens_groups, l.weight_g, l.filter_size_mm,
           l.min_focus_distance_m, l.diaphragm_blades, l.max_magnification,
           length(coalesce(l.description, '')) as desc_len
    from lenses l
    where l.merged_into_id is null
  `;
  const byBrand = new Map();
  for (const l of lenses) {
    const key = (l.brand ?? "").toLowerCase();
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key).push(l);
  }

  const pages = crawl.pages.filter((p) => p.hasSpecs || p.summary);
  const results = [];

  for (const page of pages) {
    const brandNames = BRANDS[page.brandDir] ?? [];
    const want = parseTitle(page.heading || page.title);
    if (!want.aperture) {
      want.aperture =
        parseTitle(page.summary?.name).aperture ??
        parseTitle(page.specs?.Name).aperture ??
        parseTitle(page.specs?.["Maximum Aperture"]).aperture ??
        apertureFromPath(page.url);
    }
    if (!want.focal) Object.assign(want, parseTitle(page.summary?.name));
    const base = { page: page.url, title: page.heading || page.title, want, years: [page.yearFrom, page.yearTo], facts: page.facts };
    if (!want.focal || !want.aperture) {
      results.push({ ...base, match: null, reason: "could not read focal length or aperture from the title" });
      continue;
    }

    const pool = brandNames.flatMap((b) => byBrand.get(b.toLowerCase()) ?? []);
    const wantMax = want.focalMax ?? want.focal;
    const candidates = pool.filter(
      (l) =>
        Number(l.focal_length_min) === want.focal &&
        (want.focalMax ? Number(l.focal_length_max) === wantMax : l.focal_length_max == null || Number(l.focal_length_max) === want.focal) &&
        Math.abs(Number(l.aperture_min) - want.aperture) < 0.06,
    );
    if (!candidates.length) {
      results.push({ ...base, match: null, reason: "no lens with that brand, focal length and aperture" });
      continue;
    }

    const pageTokens = tokens(`${page.heading} ${page.summary?.name ?? ""} ${page.specs?.Name ?? ""}`);
    const scored = candidates
      .map((l) => {
        const lensTokens = tokens(l.name);
        let score = 0;
        const hits = [];
        for (const t of pageTokens) if (lensTokens.has(t)) { score += 2; hits.push(t); }
        // A version token on our name that his title lacks counts against
        // that row ("II" when he reviews the original).
        for (const t of ["ii", "iii", "iv", "vr", "is", "g", "d", "ais", "ai", "asph", "apo", "macro", "micro"]) {
          if (lensTokens.has(t) && !pageTokens.has(t)) score -= 1;
        }
        if (page.yearFrom && l.year_introduced) {
          const gap = Math.abs(l.year_introduced - page.yearFrom);
          score += gap === 0 ? 3 : gap <= 1 ? 2 : gap <= 3 ? 0 : -2;
        }
        if (page.facts.elements && l.lens_elements) score += l.lens_elements === page.facts.elements ? 2 : -2;
        if (page.facts.weightG && l.weight_g) {
          const rel = Math.abs(l.weight_g - page.facts.weightG) / l.weight_g;
          score += rel <= 0.05 ? 2 : rel <= 0.12 ? 1 : -1;
        }
        if (page.facts.minFocusM && l.min_focus_distance_m) {
          score += Math.abs(Number(l.min_focus_distance_m) - page.facts.minFocusM) < 0.02 ? 1 : -1;
        }
        return { lens: l, score, hits };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const runnerUp = scored[1];
    const confident = best.score >= 2 && (!runnerUp || best.score >= runnerUp.score + 2);

    const fills = [];
    if (confident) {
      const l = best.lens;
      const f = page.facts;
      if (!l.weight_g && f.weightG) fills.push(["weightG", Math.round(f.weightG)]);
      if (!l.filter_size_mm && f.filterMm) fills.push(["filterSizeMm", f.filterMm]);
      if (!l.min_focus_distance_m && f.minFocusM) fills.push(["minFocusDistanceM", f.minFocusM]);
      if (!l.lens_elements && f.elements) fills.push(["lensElements", f.elements]);
      if (!l.lens_groups && f.groups) fills.push(["lensGroups", f.groups]);
      if (!l.diaphragm_blades && f.blades) fills.push(["diaphragmBlades", f.blades]);
      if (!l.max_magnification && f.maxMagnification) fills.push(["maxMagnification", f.maxMagnification]);
      if (!l.year_introduced && page.yearFrom) fills.push(["yearIntroduced", page.yearFrom]);
      if (!l.year_discontinued && page.yearTo) fills.push(["yearDiscontinued", page.yearTo]);
    }

    results.push({
      ...base,
      match: confident ? { id: best.lens.id, name: best.lens.name, slug: best.lens.slug, score: best.score, descLen: best.lens.desc_len } : null,
      alternatives: confident ? [] : scored.slice(0, 5).map((s) => `${s.lens.name} [${s.lens.slug}] (${s.score})`),
      reason: confident ? null : candidates.length === 1 ? "one candidate but the evidence disagrees with it" : "ambiguous, several versions score alike",
      fills,
    });
  }

  const matched = results.filter((r) => r.match);
  const missing = results.filter((r) => !r.match && /no lens with/.test(r.reason));
  const ambiguous = results.filter((r) => !r.match && !/no lens with/.test(r.reason));
  const distinct = new Set(matched.map((r) => r.match.id));
  const thin = matched.filter((r) => r.match.descLen < 400);

  console.log(`Reviews considered: ${results.length}`);
  console.log(`  matched to one of our rows: ${matched.length} (${distinct.size} distinct lenses), ${thin.length} of them with a description under 400 chars`);
  console.log(`  no row with that brand, focal length and aperture (candidates for import): ${missing.length}`);
  console.log(`  ambiguous or unreadable: ${ambiguous.length}`);
  const fillCounts = {};
  for (const r of matched) for (const [k] of r.fills) fillCounts[k] = (fillCounts[k] ?? 0) + 1;
  console.log(`  columns his pages could fill on matched rows: ${Object.entries(fillCounts).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);

  if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(results, null, 1));
  if (mdOut) {
    const lines = ["# Ken Rockwell reviews against our lens rows", "", `Crawl: ${crawl.crawledAt}`, ""];
    lines.push(`- Matched: **${matched.length}** reviews, **${distinct.size}** lenses (${thin.length} with a thin description)`);
    lines.push(`- Missing from the catalogue: **${missing.length}**`);
    lines.push(`- Ambiguous or unreadable: **${ambiguous.length}**`, "");
    lines.push(`## Missing from the catalogue: ${missing.length}`, "");
    for (const r of missing.sort((a, b) => a.page.localeCompare(b.page))) {
      const y = r.years[0] ? ` (${r.years[0]}${r.years[1] ? `-${r.years[1]}` : "-"})` : "";
      lines.push(`- ${r.title}${y}: ${r.want.focal}${r.want.focalMax ? `-${r.want.focalMax}` : ""}mm f/${r.want.aperture}, ${r.facts.elements ? `${r.facts.elements}/${r.facts.groups}, ` : ""}${r.facts.weightG ? `${r.facts.weightG}g, ` : ""}<${r.page}>`);
    }
    lines.push("", `## Matched: ${matched.length}`, "");
    for (const r of matched.sort((a, b) => a.match.name.localeCompare(b.match.name))) {
      const fills = r.fills.length ? ` — fills ${r.fills.map(([k, v]) => `${k}=${v}`).join(", ")}` : "";
      lines.push(`- **${r.match.name}** [${r.match.slug}] ← ${r.title} (score ${r.match.score}, description ${r.match.descLen} chars)${fills}`);
    }
    lines.push("", `## Ambiguous or unreadable: ${ambiguous.length}`, "");
    for (const r of ambiguous.sort((a, b) => a.page.localeCompare(b.page))) {
      lines.push(`- ${r.title} <${r.page}>: ${r.reason}`);
      for (const a of r.alternatives ?? []) lines.push(`  - ${a}`);
    }
    writeFileSync(resolve(mdOut), lines.join("\n") + "\n");
    console.log(`wrote ${mdOut}`);
  }
} finally {
  await sql.end();
}
