/**
 * Draft descriptions, in our own words, for lenses whose page has a stub and
 * whose Ken Rockwell review the mapper tied to them with confidence.
 *
 * Input is the crawl (scraper/kenrockwell-scrape.mjs) and the mapping
 * (scripts/map-kenrockwell-to-lenses.mjs --json). For each thin row the model
 * is given our row's facts, his typed facts and the text of his sections, and
 * asked for catalogue prose under the site's rules:
 *
 *   - our words, never his sentences; no reviewer named, no "review"
 *   - no prices in any currency: the site runs its own price pipeline
 *   - no em dashes; British spelling; plain statements, no first person
 *   - three to five short paragraphs separated by blank lines, which the
 *     page keeps as written
 *   - every fact from the material given, none invented
 *
 * Each draft is checked against those rules and retried once, then written
 * to a JSONL file and a Markdown file for reading. Nothing reaches the
 * database until --apply, which writes each draft with a patrolled revision
 * and a citation, then revalidates the pages.
 *
 * Usage (from frontend/):
 *   node scripts/draft-kenrockwell-descriptions.mjs ../scraper/kenrockwell.json ../scraper/kenrockwell-map.json
 *   node scripts/draft-kenrockwell-descriptions.mjs <crawl> <map> --limit 5 --model google/gemini-3.1-flash-lite
 *   node scripts/draft-kenrockwell-descriptions.mjs <crawl> <map> --apply       # write the drafts in the JSONL
 *   node scripts/draft-kenrockwell-descriptions.mjs <crawl> <map> --apply --only slug-a,slug-b
 *   node scripts/draft-kenrockwell-descriptions.mjs ../scraper/kenrockwell-cameras.json ../scraper/kenrockwell-cameras-map.json --entity cameras
 */

import { generateText } from "ai";
import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
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
const VALUED = new Set(["--limit", "--model", "--only", "--out", "--max-chars", "--entity"]);
const files = [];
for (let i = 0; i < args.length; i++) {
  if (VALUED.has(args[i])) i += 1;
  else if (!args[i].startsWith("--")) files.push(args[i]);
}
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const [crawlFile, mapFile] = files;
const LIMIT = parseInt(argVal("--limit", "1000"), 10);
const MODEL = argVal("--model", "google/gemini-3.1-flash-lite");
const MAX_CHARS = parseInt(argVal("--max-chars", "400"), 10);
const ENTITY = argVal("--entity", "lenses") === "cameras" ? "cameras" : "lenses";
const ENTITY_TYPE = ENTITY === "cameras" ? "camera" : "lens";
const PATH_PREFIX = ENTITY === "cameras" ? "/cameras" : "/lenses";
const OUT = argVal("--out", ENTITY === "cameras" ? "../scraper/kenrockwell-camera-drafts.jsonl" : "../scraper/kenrockwell-drafts.jsonl");
const APPLY = args.includes("--apply");
const ONLY = argVal("--only", null)?.split(",").map((s) => s.trim());
if (!crawlFile || !mapFile) {
  console.error("usage: node scripts/draft-kenrockwell-descriptions.mjs <crawl.json> <map.json> [--limit n] [--model id] [--apply] [--only slugs]");
  process.exit(1);
}

const crawl = JSON.parse(readFileSync(resolve(crawlFile), "utf8"));
const mapping = JSON.parse(readFileSync(resolve(mapFile), "utf8"));
const pageByUrl = new Map(crawl.pages.map((p) => [p.url, p]));

// ---------------------------------------------------------------------------
// Rules a draft must pass
// ---------------------------------------------------------------------------

/**
 * Numbers a draft states must agree with the facts it was given. A weight
 * of 400 g for a 2.4 kg lens is the kind of error prose hides well.
 */
function numbersDisagree(text, known) {
  const out = [];
  const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(a, b);
  const grams = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:g|grams?)\b/gi)].map((m) => parseFloat(m[1].replace(/,/g, "")));
  if (known.weightG && grams.length && !grams.some((g) => near(g, known.weightG, 0.06))) out.push(`weight ${grams.join("/")} g vs ${known.weightG} g`);
  const filters = [...text.matchAll(/(\d{2,3})\s*mm\s*(?:filter|thread)/gi)].map((m) => parseFloat(m[1]));
  if (known.filterMm && filters.length && !filters.includes(known.filterMm)) out.push(`filter ${filters.join("/")} mm vs ${known.filterMm} mm`);
  const mp = [...text.matchAll(/(\d+(?:\.\d+)?)[\s-]*(?:MP\b|megapixels?)/gi)].map((m) => parseFloat(m[1]));
  if (known.megapixels && mp.length && !mp.some((v) => near(v, known.megapixels, 0.06))) out.push(`megapixels ${mp.join("/")} vs ${known.megapixels}`);
  const focus = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:m|metres?)\b(?![\w])/gi)].map((m) => parseFloat(m[1])).filter((v) => v < 30);
  if (known.minFocusM && focus.length && !focus.some((f) => near(f, known.minFocusM, 0.06))) out.push(`close focus ${focus.join("/")} m vs ${known.minFocusM} m`);
  return out;
}

function problems(text, known = {}) {
  const out = [...numbersDisagree(text, known)];
  if (/\b(today|currently|still (in production|sold|available)|remains in production)\b/i.test(text)) out.push("claims the lens is current");
  if (/[$€£¥]\s?\d|\d\s?(dollars|euros|pounds)\b/i.test(text)) out.push("mentions a price");
  // "image review" is a camera setting; "this review" is the source talking.
  if (/rockwell|\bken\b|\breviewer\b|\b(this|his|the|a|my|our) review\b|\breviewed\b/i.test(text)) out.push("names the reviewer or a review");
  if (/—/.test(text)) out.push("em dash");
  // "AF-I" and "Mark I" are not the first person.
  if (/(?<![-\w])(I|I've|I'd)(?=\s)|\b(my|mine)\b/.test(text.replace(/\b(Mark|Type|Mk|Series|EOS|Version) I\b/g, ""))) out.push("first person");
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length < 3 || paragraphs.length > 5) out.push(`${paragraphs.length} paragraphs`);
  if (text.length < 700) out.push("under 700 characters");
  if (text.length > 2600) out.push("over 2600 characters");
  if (/^\s*[-*#]/m.test(text)) out.push("markdown or list syntax");
  return out;
}

function facts(lens, page) {
  const f = page.facts ?? {};
  const s = page.specs ?? {};
  const lines = [];
  const put = (label, v) => v != null && v !== "" && lines.push(`${label}: ${v}`);
  put("Our catalogue name", lens.name);
  put("Brand", lens.brand);
  put("Focal length", lens.focal_length_max && lens.focal_length_max !== lens.focal_length_min ? `${lens.focal_length_min}-${lens.focal_length_max}mm` : `${lens.focal_length_min}mm`);
  put("Maximum aperture", lens.aperture_min ? `f/${lens.aperture_min}` : null);
  put("Mount / system", lens.system_name);
  put("Year introduced", lens.year_introduced ?? page.yearFrom);
  put("Year discontinued", lens.year_discontinued ?? page.yearTo);
  put("Production note", page.yearNote);
  put("Optical construction", f.elements ? `${f.elements} elements in ${f.groups} groups` : lens.lens_elements ? `${lens.lens_elements} elements in ${lens.lens_groups} groups` : null);
  put("Diaphragm blades", f.blades ?? lens.diaphragm_blades);
  put("Close focus", (f.minFocusM ?? lens.min_focus_distance_m) ? `${f.minFocusM ?? lens.min_focus_distance_m} m` : null);
  put("Maximum magnification", f.maxMagnification ?? lens.max_magnification);
  put("Filter thread", (f.filterMm ?? lens.filter_size_mm) ? `${f.filterMm ?? lens.filter_size_mm} mm` : null);
  put("Weight", (f.weightG ?? lens.weight_g) ? `${Math.round(f.weightG ?? lens.weight_g)} g` : null);
  put("Size", f.diameterMm ? `${f.diameterMm} mm diameter, ${f.lengthMm} mm long` : null);
  for (const k of ["Optics", "Diaphragm", "Focus", "Autofocus", "Image Stabilization", "Aperture Ring", "Coverage", "Quality", "Made in", "Hood", "Weather Sealing"]) if (s[k]) put(k, s[k].slice(0, 300));
  if (lens.description) put("Our current stub", lens.description.slice(0, 400));
  return lines.join("\n");
}

function cameraFacts(cam, page) {
  const s = page.specs ?? {};
  const k = page.camera ?? {};
  const lines = [];
  const put = (label, v) => v != null && v !== "" && lines.push(`${label}: ${v}`);
  put("Our catalogue name", cam.name);
  put("Alias", cam.alias);
  put("Mount / system", cam.system_name);
  put("Body type", cam.body_type);
  put("Year introduced", cam.year_introduced ?? page.yearFrom);
  put("Year discontinued", page.yearTo);
  put("Sensor or format", cam.sensor_size ?? k.sensor);
  put("Sensor type", cam.sensor_type);
  put("Megapixels", cam.megapixels ?? k.megapixels);
  put("Resolution", cam.resolution);
  put("Shutter", cam.shutter_type ?? k.shutter);
  put("Weight", (page.facts?.weightG ?? cam.weight_g) ? `${Math.round(page.facts?.weightG ?? cam.weight_g)} g` : null);
  put("Size", page.facts?.diameterMm ? `${page.facts.diameterMm} × ${page.facts.lengthMm} mm` : null);
  for (const key of ["Sensor", "Image Sensor", "Lens Mount", "Lens", "Shutter", "Flash Sync", "ISO", "Frame Rate", "Viewfinder", "Finder", "Rear LCD", "LCD", "Autofocus", "Metering", "Movies", "Video", "Memory", "Card", "Battery", "Power", "Body", "Quality", "Made in", "Weather Sealing"]) if (s[key]) put(key, s[key].slice(0, 300));
  if (cam.description) put("Our current stub", cam.description.slice(0, 400));
  return lines.join("\n");
}

const SYSTEM_CAMERAS = `You write entries for a camera catalogue. Each entry describes one camera body for someone deciding whether to buy or use it.

Write from the material provided and nothing else. Do not invent specifications, dates or claims. Where the material carries an opinion about image quality, autofocus, handling or build, state it plainly as a property of the camera ("autofocus keeps up with running children"), never as someone's opinion, and never name any person, website or review.

Rules:
- Three to five short paragraphs, separated by one blank line. No headings, no lists, no markdown.
- Between 800 and 2200 characters in total.
- No prices, no currency symbols, no "cheap" or "expensive" in money terms. Relative statements about the used market are fine.
- No em dashes. Use commas, full stops or parentheses.
- British spelling (centre, colour, metres). Third person only.
- Paragraph 1: what the camera is, when it was made, where it sits in its maker's line, what it replaced or was replaced by, and what is distinctive about it.
- Paragraph 2: the pictures: sensor or film format, resolution, high-ISO behaviour, colour, dynamic range, whatever the material covers; for a film camera, the meter, the shutter and the finder.
- Paragraph 3: using it: autofocus, viewfinder, controls and ergonomics, speed, battery, build and sealing.
- A further paragraph only if the material describes versions, firmware or model quirks, or a buying pitfall worth knowing.
- Never say a camera is current, still sold, still made or available "today": the material may be years old. Give production as years only.
- Do not restate the raw specification list as a sentence of numbers; weave in only the numbers that matter (resolution, weight and frame rate are usually worth one mention each).

Return only the entry text.`;

const SYSTEM = ENTITY === "cameras" ? SYSTEM_CAMERAS : `You write entries for a camera lens catalogue. Each entry describes one lens for someone deciding whether to buy or use it.

Write from the material provided and nothing else. Do not invent specifications, dates or claims. Where the material carries an opinion about optical or mechanical quality, state it plainly as a property of the lens ("the corners are soft until f/5.6"), never as someone's opinion, and never name any person, website or review.

Rules:
- Three to five short paragraphs, separated by one blank line. No headings, no lists, no markdown.
- Between 800 and 2200 characters in total.
- No prices, no currency symbols, no "cheap" or "expensive" in money terms. Relative statements about the used market are fine ("sells for less than the metal version").
- No em dashes. Use commas, full stops or parentheses.
- British spelling (centre, colour, metres). Third person only.
- Paragraph 1: what the lens is, when it was made, where it sits in its maker's line, and anything distinctive about its design.
- Paragraph 2: how it draws: sharpness across the aperture range, distortion, bokeh, flare, colour fringing, whatever the material covers.
- Paragraph 3: build, focusing, handling, filters and hood.
- A further paragraph only if the material describes versions, identification marks or a buying pitfall worth knowing.
- Never say a lens is current, still sold, still made or available "today": the material may be years old. Give production as years only.
- Do not restate the raw specification list as a sentence of numbers; weave in only the numbers that matter to the story (close focus, weight, filter thread are usually worth one mention each).

Return only the entry text.`;

// ---------------------------------------------------------------------------

const sql = createSql();
try {
  const targets = mapping.filter((r) => r.match && r.match.descLen < MAX_CHARS && (!ONLY || ONLY.includes(r.match.slug)));
  // One draft per lens even when two reviews map to it: the longer review wins.
  const byLens = new Map();
  for (const r of targets) {
    const page = pageByUrl.get(r.page);
    const textLen = Object.values(page?.text ?? {}).join("").length;
    const prev = byLens.get(r.match.id);
    if (!prev || textLen > prev.textLen) byLens.set(r.match.id, { r, page, textLen });
  }
  const jobs = [...byLens.values()].slice(0, LIMIT);
  console.log(`${byLens.size} thin lenses with a matched review; drafting ${jobs.length} with ${MODEL}`);

  if (APPLY) {
    const drafts = readFileSync(resolve(OUT), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const chosen = drafts.filter((d) => d.ok && (!ONLY || ONLY.includes(d.slug)));
    const backup = `${process.env.HOME}/Work/lens-db-descriptions-before-${new Date().toISOString().slice(0, 10)}.jsonl`;
    const paths = [];
    for (const d of chosen) {
      const [row] = await sql.query(`select id, slug, name, description from ${ENTITY} where id = $1`, [d.id]);
      if (!row || row.slug !== d.slug) throw new Error(`row ${d.id} is not ${d.slug} any more`);
      appendFileSync(backup, JSON.stringify({ table: "lenses", id: row.id, slug: row.slug, description: row.description }) + "\n");
      await sql.query(`update ${ENTITY} set description = $1 where id = $2`, [d.description, d.id]);
      const [full] = await sql.query(`select * from ${ENTITY} where id = $1`, [d.id]);
      const snapshot = {};
      for (const [k, v] of Object.entries(full)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = ${ENTITY_TYPE} and entity_id = ${d.id}`;
      const [rev] = await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled, patrolled_at)
        values (${ENTITY_TYPE}, ${d.id}, ${next}, ${JSON.stringify(snapshot)}::jsonb, ${`Wrote the description from a published review of this ${ENTITY_TYPE}`}, '["description"]'::jsonb, true, now()) returning id`;
      await sql`insert into field_citations (entity_type, entity_id, field, source_name, source_url, retrieved_at, revision_id, note)
        values (${ENTITY_TYPE}, ${d.id}, 'description', 'Ken Rockwell', ${d.source}, now(), ${rev.id}, 'Summarised in our own words from the review; facts cross-checked against the row.')
        on conflict (entity_type, entity_id, field) do update set source_name = excluded.source_name, source_url = excluded.source_url, retrieved_at = excluded.retrieved_at, revision_id = excluded.revision_id, note = excluded.note`;
      paths.push(`${PATH_PREFIX}/${d.slug}`);
      console.log(`  wrote ${d.slug}`);
    }
    if (paths.length && process.env.CRON_SECRET) {
      const r = await fetch(`${process.env.API_URL ?? "https://thelensdb.com"}/api/cron/revalidate`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ tags: [ENTITY], paths }),
      });
      console.log(`revalidate: HTTP ${r.status}`);
    }
    console.log(`Applied ${paths.length}; before-values in ${backup}`);
    process.exit(0);
  }

  writeFileSync(resolve(OUT), "");
  const md = ["# Description drafts from Ken Rockwell reviews", "", `Model: ${MODEL}. Drafts marked FAILED did not pass the rules after a retry and are not applied.`, ""];
  let ok = 0;
  for (const { r, page } of jobs) {
    const [lens] = await sql.query(`select l.*, s.name as system_name from ${ENTITY} l left join systems s on s.id = l.system_id where l.id = $1`, [r.match.id]);
    const material = [
      "FACTS", ENTITY === "cameras" ? cameraFacts(lens, page) : facts(lens, page), "",
      "INTRODUCTION (source text)", page.text?.intro || "(none)", "",
      "IDENTIFICATION AND VERSIONS (source text)", page.text?.identification || "(none)", "",
      "PERFORMANCE (source text)", page.text?.performance || "(none)", "",
      ...(ENTITY === "cameras" ? ["USAGE (source text)", page.text?.usage || "(none)", "", "COMPARED (source text)", page.text?.compared || "(none)", ""] : []),
      "RECOMMENDATIONS (source text)", page.text?.recommendations || "(none)",
    ].join("\n");

    let draft = null;
    let issues = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const nudge = attempt ? `\n\nThe previous attempt was rejected for: ${issues.join("; ")}. Fix those and return only the entry.` : "";
      const { text } = await generateText({ model: MODEL, system: SYSTEM, prompt: material + nudge, temperature: 0.4 });
      draft = text.trim().replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
      issues = problems(draft, ENTITY === "cameras"
        ? { weightG: page.facts?.weightG ?? lens.weight_g, megapixels: lens.megapixels ?? page.camera?.megapixels }
        : { weightG: page.facts?.weightG ?? lens.weight_g, filterMm: page.facts?.filterMm ?? lens.filter_size_mm, minFocusM: page.facts?.minFocusM ?? lens.min_focus_distance_m });
      if (!issues.length) break;
    }
    const passed = issues.length === 0;
    ok += passed ? 1 : 0;
    appendFileSync(resolve(OUT), JSON.stringify({ id: lens.id, slug: lens.slug, name: lens.name, source: r.page, ok: passed, issues, description: draft }) + "\n");
    md.push(`## ${lens.name}${passed ? "" : " (FAILED: " + issues.join(", ") + ")"}`, "", `[${lens.slug}](https://thelensdb.com${PATH_PREFIX}/${lens.slug}) ← <${r.page}>`, "", `> current: ${(lens.description ?? "").replace(/\s+/g, " ").slice(0, 200) || "(empty)"}`, "", draft, "");
    console.log(`  ${passed ? "ok    " : "FAILED"} ${lens.slug} (${draft.length} chars${issues.length ? `: ${issues.join(", ")}` : ""})`);
  }
  writeFileSync(resolve(OUT.replace(/\.jsonl$/, ".md")), md.join("\n"));
  console.log(`\n${ok} of ${jobs.length} drafts passed. Read ${OUT.replace(/\.jsonl$/, ".md")}, then --apply to write the passing ones.`);
} finally {
  await sql.end();
}
