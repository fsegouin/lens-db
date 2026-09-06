/**
 * Match a kenrockwell.com camera crawl (scraper/kenrockwell-scrape.mjs
 * --kind cameras) against our camera rows.
 *
 * Bodies are matched on their model designation, which both sides write in
 * their own way: we have "Nikon Z 6II", "Canon EOS 5D mark IV", "Sony a7R
 * III" and "Leica M (Typ 240)"; he writes "Nikon Z6 II", "Canon 5D Mark IV",
 * "Sony A7R III" and "LEICA M typ 240". Stripping the maker, "EOS", "Typ",
 * "Mark" and every non-alphanumeric leaves a key both agree on ("z6ii",
 * "5div", "a7riii", "m240"). Year and megapixels break ties, and a row whose
 * name carries a quoted edition ("Leica M10 "Edition Zagato"") loses to the
 * plain model when he reviewed the plain model.
 *
 * Nothing is written. Output is matched / missing / ambiguous, as for lenses.
 *
 * Usage (from frontend/):
 *   node scripts/map-kenrockwell-to-cameras.mjs ../scraper/kenrockwell-cameras.json --md out.md --json out.json
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
  console.error("usage: node scripts/map-kenrockwell-to-cameras.mjs <crawl.json> [--md out.md] [--json out.json]");
  process.exit(1);
}
const crawl = JSON.parse(readFileSync(resolve(file), "utf8"));

function family(text) {
  const t = (text ?? "").toLowerCase();
  if (/fuji/.test(t)) return "fuji";
  if (/leica|leitz/.test(t)) return "leica";
  if (/konica minolta|minolta/.test(t)) return "minolta";
  if (/asahi|pentax/.test(t)) return "pentax";
  if (/zeiss|contax/.test(t)) return "contax";
  if (/nikon|nippon/.test(t)) return "nikon";
  return t.split(/[^a-z]/)[0];
}

const MAKER_WORDS = /\b(nikon|nikkor|canon|eos|sony|alpha|leica|leitz|fujifilm|fuji|pentax|asahi|olympus|hasselblad|mamiya|minolta|konica|contax|zeiss|ikon|typ|type|mark|mk|review|camera|body|digital|slr|dslr|mirrorless|rangefinder|the|professional)\b/g;

/** "Canon EOS 5D mark IV" → "5div"; "Sony α7R III" → "a7riii"; "Leica M (Typ 240)" → "m240". */
function modelKey(name) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[“”"][^“”"]*[“”"]/g, " ") // quoted editions
    .replace(/[αa]lpha\s*/g, "a")
    .replace(/α/g, "a")
    .replace(/&.*$/, "")
    .replace(MAKER_WORDS, " ")
    .replace(/\bii\b/g, "ii")
    .replace(/[^a-z0-9]+/g, "");
}

const hasEdition = (name) => /[“”"]|\b(limited|edition|anniversary|silver|black paint|titanium|safari|graphite|ir\b|infrared|kit)\b/i.test(name);

const sql = createSql();
try {
  const cameras = await sql`select id, name, slug, year_introduced, megapixels, sensor_size, weight_g, length(coalesce(description, '')) as desc_len from cameras where merged_into_id is null`;
  const byFamilyKey = new Map();
  for (const c of cameras) {
    const k = `${family(c.name)}|${modelKey(c.name)}`;
    if (!byFamilyKey.has(k)) byFamilyKey.set(k, []);
    byFamilyKey.get(k).push(c);
  }
  const byFamily = new Map();
  for (const c of cameras) {
    const f = family(c.name);
    if (!byFamily.has(f)) byFamily.set(f, []);
    byFamily.get(f).push(c);
  }

  const pages = crawl.pages.filter((p) => p.kind === "camera");
  const results = [];
  for (const page of pages) {
    const fam = family(page.brandDir);
    const heading = (page.heading || page.title).replace(/\s+Review\b.*$/i, "");
    // "Canon T6i (EOS 750D)", "Canon 5DS & 5DS R": each name is tried on its own.
    const variants = [heading, ...heading.split(/[()&,]|\bor\b|\band\b/).map((v) => v.trim()).filter((v) => v.length > 1)];
    const keys = [...new Set(variants.map(modelKey).filter(Boolean))];
    const key = keys[0];
    const base = { page: page.url, title: heading, key, years: [page.yearFrom, page.yearTo], camera: page.camera };
    if (!key) {
      results.push({ ...base, match: null, reason: "no model designation in the title" });
      continue;
    }
    let candidates = keys.flatMap((k) => byFamilyKey.get(`${fam}|${k}`) ?? []);
    let how = "exact";
    if (!candidates.length) {
      // "Nikon D3" against our "Nikon D3" only; but "Fuji X100V" may sit as "x100v" while he wrote "X100 V".
      candidates = (byFamily.get(fam) ?? []).filter((c) => {
        const ck = modelKey(c.name);
        return ck.length >= 2 && keys.some((k) => ck === k || (ck.startsWith(k) && ck.length - k.length <= 1 && /[a-z]$/.test(ck)));
      });
      how = "near";
    }
    if (!candidates.length) {
      results.push({ ...base, match: null, reason: "no camera with that designation" });
      continue;
    }
    const scored = candidates
      .map((c) => {
        let score = how === "exact" ? 10 : 4;
        if (hasEdition(c.name) && !hasEdition(heading)) score -= 5;
        if (page.yearFrom && c.year_introduced) score += Math.abs(c.year_introduced - page.yearFrom) <= 1 ? 3 : -2;
        if (page.camera?.megapixels && c.megapixels) score += Math.abs(c.megapixels - page.camera.megapixels) <= 1.5 ? 2 : -3;
        return { c, score };
      })
      .sort((x, y) => y.score - x.score);
    const best = scored[0];
    const runnerUp = scored[1];
    const confident = best.score >= 8 && (!runnerUp || best.score >= runnerUp.score + 3);
    results.push({
      ...base,
      match: confident ? { id: best.c.id, name: best.c.name, slug: best.c.slug, score: best.score, descLen: best.c.desc_len } : null,
      alternatives: confident ? [] : scored.slice(0, 5).map((s) => `${s.c.name} [${s.c.slug}] (${s.score})`),
      reason: confident ? null : "ambiguous",
    });
  }

  const matched = results.filter((r) => r.match);
  const missing = results.filter((r) => !r.match && /no camera/.test(r.reason));
  const ambiguous = results.filter((r) => !r.match && !/no camera/.test(r.reason));
  console.log(`Camera reviews: ${pages.length} (${crawl.pages.length} pages crawled, kinds: ${JSON.stringify(crawl.pages.reduce((a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a), {}))})`);
  console.log(`  matched: ${matched.length} (${new Set(matched.map((r) => r.match.id)).size} distinct), missing: ${missing.length}, ambiguous: ${ambiguous.length}`);

  if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(results, null, 1));
  if (mdOut) {
    const lines = ["# Ken Rockwell camera reviews against our camera rows", "", `- Matched: **${matched.length}**`, `- Missing: **${missing.length}**`, `- Ambiguous: **${ambiguous.length}**`, ""];
    lines.push(`## Missing: ${missing.length}`, "");
    for (const r of missing.sort((a, b) => a.page.localeCompare(b.page))) lines.push(`- ${r.title} (${r.years[0] ?? "?"}) key=${r.key} <${r.page}>`);
    lines.push("", `## Matched: ${matched.length}`, "");
    for (const r of matched.sort((a, b) => a.match.name.localeCompare(b.match.name))) lines.push(`- **${r.match.name}** [${r.match.slug}] ← ${r.title} (score ${r.match.score}, description ${r.match.descLen} chars)`);
    lines.push("", `## Ambiguous: ${ambiguous.length}`, "");
    for (const r of ambiguous) {
      lines.push(`- ${r.title} key=${r.key} <${r.page}>`);
      for (const a of r.alternatives ?? []) lines.push(`  - ${a}`);
    }
    writeFileSync(resolve(mdOut), lines.join("\n") + "\n");
    console.log(`wrote ${mdOut}`);
  }
} finally {
  await sql.end();
}
