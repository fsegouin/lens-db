/**
 * Find the lenses and cameras lens-db.com lists that our catalogue does not.
 *
 * lens-db.com came back online with its content behind a registration wall,
 * but its WordPress sitemaps are public. A sitemap entry is only a URL, and
 * the URL is a slug of the entry's name ("canon-fd-50mm-f14-ssc-i-1973"), so
 * the slug is all we have to go on. The site has also renamed a lot of slugs
 * since our catalogue was scraped from its archived pages: mount suffixes
 * ("-lsm", "-slr"), a version marker on first versions ("-i"), a year, a new
 * transliteration of Soviet names ("gelios" for Helios, "zorkii" for Zorki).
 * A plain URL compare therefore reports well over a thousand lenses we
 * already hold.
 *
 * Two passes:
 *
 *   1. Deterministic: the stored source URL, the slug, the slug without its
 *      year, a punctuation-free key of the slug or name, and for lenses the
 *      same focal and aperture with no distinguishing word on either side.
 *   2. For what is left, a model reads the slug beside the closest catalogue
 *      rows and returns the entry's display name, a verdict (same / variant /
 *      missing) and its confidence. A wrong "missing" makes a duplicate row,
 *      so anything under the confidence bar goes to a person, not the list.
 *
 * Nothing is written to the database. Outputs go to --dir:
 *   verdicts.jsonl   one model verdict per sitemap URL (resumable)
 *   gaps.json        every sitemap entry with how it was resolved
 *   missing.json     entries judged missing, the input for enrichment
 *   review.json      entries the model was not sure about
 *   report.md        counts and the lists above in readable form
 *
 * Usage (from frontend/):
 *   node scripts/lensdb-sitemap-gaps.mjs --no-llm        # deterministic pass only, print counts
 *   node scripts/lensdb-sitemap-gaps.mjs --limit 40      # judge the first 40 unresolved entries
 *   node scripts/lensdb-sitemap-gaps.mjs                 # judge everything unresolved, then report
 *   node scripts/lensdb-sitemap-gaps.mjs --report        # rebuild the outputs from verdicts.jsonl
 *   node scripts/lensdb-sitemap-gaps.mjs --only urls.txt --verdicts second.jsonl --model google/gemini-3.8-flash
 *                                                        # a second model on chosen entries (outputs untouched)
 *   node scripts/lensdb-sitemap-gaps.mjs --report --second-opinion second.jsonl
 *                                                        # disagreements between the two go to review
 */

import { generateText, Output } from "ai";
import { z } from "zod";
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
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const DIR = resolve(argVal("--dir", "../scraper/lensdb-sitemap"));
const MODEL = argVal("--model", "google/gemini-3.1-flash-lite");
const LIMIT = Number(argVal("--limit", "0"));
const CONCURRENCY = Number(argVal("--concurrency", "8"));
const NO_LLM = args.includes("--no-llm");
const REPORT_ONLY = args.includes("--report");
const ONLY = argVal("--only", null);
// A second model's verdicts on the same entries. Where the two disagree on
// present versus missing, the entry goes to review instead of either list.
const SECOND = argVal("--second-opinion", null);
const CONFIDENT = 0.8;

const VERDICTS = resolve(DIR, argVal("--verdicts", "verdicts.jsonl"));

// ---------------------------------------------------------------------------
// Slug handling

/** Old and new transliterations of the same Russian names. */
const TRANSLIT = [
  [/\bgelios\b/g, "helios"],
  [/\byupiter\b/g, "jupiter"],
  [/\bzorkii\b/g, "zorki"],
  [/\bzenit-?e\b/g, "zenit-e"],
];

/** Words that name a mount, a first version or a filler, never a different lens. */
const SOFT = new Set([
  "i", "lsm", "ltm", "slr", "dslr", "milc", "m", "m39", "m42", "fe", "e", "ef", "rf", "z", "x", "l", "k",
  "for", "the", "auto", "mc", "type", "ff", "ddr", "p", "sn",
  // Our rows for the Zeiss SLR lines list every mount in the name ("ZE / ZF / ZF.2 / ZK").
  "ze", "zf", "zf2", "zk",
]);

function slugify(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[/.'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function translit(s) {
  let out = s;
  for (const [re, to] of TRANSLIT) out = out.replace(re, to);
  return out;
}

function urlPath(u) {
  let s = String(u ?? "");
  // One malformed escape in a third-party sitemap must not end the whole run.
  try { s = decodeURIComponent(s); } catch {}
  return s.toLowerCase()
    .replace(/^https?:\/\/(www\.)?lens-db\.com\//, "").replace(/^\/|\/$/g, "");
}

const YEAR_RE = /-((?:18|19|20)\d\d)(?:-\d)?$/;
const noYear = (s) => s.replace(YEAR_RE, "").replace(/-\d$/, "");
const key = (s) => translit(noYear(s)).replace(/[^a-z0-9]/g, "");

/** Focal, aperture, year and word set of a lens slug. */
function parseSlug(slug) {
  const y = slug.match(YEAR_RE);
  let s = noYear(slug).replace(/-sn-[0-9x-]+/, "");
  s = translit(s);
  const focal = s.match(/(?:^|-)(\d+(?:-\d+)?)mm(?:-|$)/)?.[1] ?? null;
  const ap = s.match(/(?:^|-)f(\d+(?:-\d+)?)(?:-|$)/)?.[1] ?? null;
  const toks = new Set(s.split("-").filter((t) => t && !t.includes("xx")));
  return { year: y ? Number(y[1]) : null, focal, ap, toks };
}

/** The slug-style digits of a numeric value: 2.8 -> "28", 1.25 -> "125", 11 -> "11". */
const digits = (n) => (n == null ? null : String(Number(n)).replace(".", ""));

// ---------------------------------------------------------------------------
// Data

function loadSitemap() {
  const sm = JSON.parse(readFileSync(resolve(DIR, "sitemap-urls.json"), "utf8"));
  const out = [];
  for (const kind of ["post", "tc", "accessory", "camera"]) {
    for (const e of sm[kind] ?? []) {
      const path = urlPath(e.url);
      out.push({ kind: kind === "post" ? "lens" : kind, url: e.url, lastmod: e.lastmod?.slice(0, 10) ?? "", path, slug: path.split("/").pop() });
    }
  }
  return out;
}

async function loadCatalogue(sql) {
  const lenses = await sql`
    SELECT l.id, l.name, l.slug, l.url, l.merged_into_id, l.year_introduced, l.focal_length_min, l.focal_length_max,
           l.aperture_min, l.aperture_max, s.name AS system
    FROM lenses l LEFT JOIN systems s ON s.id = l.system_id`;
  const cameras = await sql`
    SELECT c.id, c.name, c.slug, c.url, c.merged_into_id, c.year_introduced, c.alias, s.name AS system
    FROM cameras c LEFT JOIN systems s ON s.id = c.system_id`;
  return { lenses, cameras };
}

function buildIndex(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const live = (r) => {
    let cur = r;
    for (let i = 0; i < 10 && cur?.merged_into_id; i++) cur = byId.get(cur.merged_into_id);
    return cur ?? r;
  };
  const byPath = new Map();
  const bySlug = new Map();
  const byKey = new Map();
  for (const r of rows) {
    if (r.url?.includes("lens-db.com")) byPath.set(urlPath(r.url), r);
    bySlug.set(r.slug, r);
    const keys = new Set([key(r.slug), key(slugify(r.name))]);
    if (r.url?.includes("lens-db.com")) keys.add(key(urlPath(r.url).split("/").pop()));
    for (const a of String(r.alias ?? "").split(/[;,]/)) if (a.trim()) keys.add(key(slugify(a)));
    for (const k of keys) if (k) (byKey.get(k) ?? byKey.set(k, []).get(k)).push(r);
  }
  const liveRows = rows.filter((r) => !r.merged_into_id);
  const parsed = liveRows.map((r) => ({ r, p: parseSlug(slugify(r.name)), ps: parseSlug(r.slug) }));
  return { byPath, bySlug, byKey, live, parsed };
}

// ---------------------------------------------------------------------------
// Pass 1: deterministic

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.max(1, a.size + b.size - inter);
}

function hardDiff(a, b) {
  return [...a].filter((t) => !b.has(t) && !SOFT.has(t));
}

function deterministic(entry, idx) {
  const { path, slug } = entry;
  if (idx.byPath.has(path)) return { how: "url", row: idx.live(idx.byPath.get(path)) };
  if (idx.bySlug.has(slug)) return { how: "slug", row: idx.live(idx.bySlug.get(slug)) };
  if (idx.bySlug.has(noYear(slug))) return { how: "slug-noyear", row: idx.live(idx.bySlug.get(noYear(slug))) };
  const k = idx.byKey.get(key(slug));
  if (k?.length) return { how: "normalized", row: idx.live(k[0]) };
  if (entry.kind === "lens") {
    const p = parseSlug(slug);
    if (!p.focal) return null;
    for (const { r, p: q } of idx.parsed) {
      if (q.focal !== p.focal || q.ap !== p.ap) continue;
      if (hardDiff(p.toks, q.toks).length || hardDiff(q.toks, p.toks).length) continue;
      if (p.year && r.year_introduced && Math.abs(p.year - r.year_introduced) > 1) continue;
      return { how: "same-words", row: r };
    }
  }
  return null;
}

/** The closest catalogue rows for the model to compare against. */
function candidates(entry, idx) {
  const p = parseSlug(entry.slug);
  const scored = [];
  for (const { r, p: q, ps } of idx.parsed) {
    let score = Math.max(jaccard(p.toks, q.toks), jaccard(p.toks, ps.toks));
    if (entry.kind === "lens" && p.focal) {
      const [f0, f1] = p.focal.split("-");
      const lo = digits(r.focal_length_min);
      const hi = digits(r.focal_length_max);
      const focalHit = (lo === f0 || lo === digits(Number(f0) / 10)) && (!f1 || hi === f1);
      if (!focalHit) continue;
      const apHit = p.ap && (p.ap.split("-")[0] === digits(r.aperture_min));
      score += apHit ? 1 : 0;
    }
    if (score > 0.15) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(({ r }) => r);
}

// ---------------------------------------------------------------------------
// Pass 2: the model

const Verdict = z.object({
  display_name: z.string().describe("The entry's name as lens-db.com would print it, without the year, e.g. 'Canon FD 50mm F/1.4 S.S.C. [I]'"),
  brand: z.string(),
  year: z.number().nullable().describe("The year from the slug, or null"),
  verdict: z.enum(["same", "variant", "missing"]),
  match_id: z.number().nullable().describe("For 'same': the id of the catalogue row that is this entry"),
  related_id: z.number().nullable().describe("For 'variant': the id of the base model this is an edition or version of"),
  is_edition: z.boolean().describe("A special, limited, anniversary, commemorative, colour or finish edition of an existing model"),
  confidence: z.number().describe("0-1, how sure the verdict is"),
  name_confidence: z.number().describe("0-1, how sure the display name is rebuilt correctly from the slug"),
  reason: z.string().describe("One short sentence"),
});

const SYSTEM = `You compare an entry from lens-db.com, known only by its URL slug, with rows from our photo-gear catalogue.

How lens-db.com slugs are made: the entry name lowercased, punctuation dropped, spaces as hyphens. "F/2.8" becomes "f28", "F/1.25" "f125", "F/4-5.6" "f4-56". A decimal focal length loses its dot ("7.5mm" becomes "75mm"). A trailing "-YYYY" is the year introduced. A trailing "-2" after the year is only a WordPress duplicate suffix. "-sn-37xxxxxx" marks a serial-number range (Vivitar lenses built by different makers). A mount word may be appended ("lsm", "slr", "m", "fe", "for-rectaflex"). The site now marks a first version "I" once a "II" exists. Soviet names use a newer transliteration: "gelios" is Helios, "yupiter" Jupiter, "zorkii" Zorki.

Our catalogue was built years ago from the same site, so most entries exist under an older name: without the year, without the mount word, without "I", with brackets such as "[MC]" or "(C)", or with a company prefix written differently ("Cosina Voigtlander" / "Voigtlander", "Nippon Kogaku" / "Nikon", "Carl Zeiss Jena DDR" / "Carl Zeiss Jena").

Verdicts:
- same: one candidate is this exact entry, allowing the naming differences above and a year off by one.
- variant: a candidate is the base model, but this entry is a distinct edition, finish, version, mount or serial-range variant that the candidate does not cover. Set related_id.
- missing: no candidate is this entry or its base model.

Before answering "missing" or "variant", go through the candidates one by one. A candidate with the same maker, focal length, aperture and line name, and a year within one of the entry's, is the same entry unless the entry carries a word that marks a real product difference the candidate lacks: a version numeral, a motor or feature code (RS, SAM, HSM, OSS, VR, D, G), a coating mark, an edition, finish or colour, or a different mount the candidate row does not list. Descriptive words that makers and catalogues add or drop freely ("High Speed", "Wide", "Tele", "Classic", "Tele-Macro" beside "Macro", a model code such as "62D" or "SEL1855", a mount list such as "ZE / ZF.2") do not make a variant.

A wrong "missing" creates a duplicate row, and a wrong "same" hides a real gap: be honest in confidence. Different generations (II vs III, AI vs AI-S, a different year of redesign with the same name) are variants, not the same. Never put the year in display_name. Rebuild display_name in lens-db.com style: maker casing as the maker writes it, "F/" apertures, roman numerals for versions.`;

function describeRow(r) {
  return {
    id: r.id,
    name: r.name,
    year: r.year_introduced ?? null,
    system: r.system ?? null,
    old_source: r.url?.includes("lens-db.com") ? urlPath(r.url) : null,
    ...(r.alias ? { alias: r.alias } : {}),
  };
}

async function judge(entry, cands) {
  const prompt = JSON.stringify({
    entry: { kind: entry.kind, slug: entry.slug, lastmod: entry.lastmod },
    candidates: cands.map(describeRow),
  }, null, 1);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { output } = await generateText({
        model: MODEL, system: SYSTEM, prompt,
        output: Output.object({ schema: Verdict }), temperature: 0, timeout: 60_000,
      });
      return output;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------

function readVerdicts(file = VERDICTS) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const v = JSON.parse(line);
    map.set(v.url, v);
  }
  return map;
}

function classify(v, second) {
  if (!v) return "unjudged";
  const sure = v.confidence >= CONFIDENT;
  if (second && (second.verdict === "same") !== (v.verdict === "same")) return "review";
  if (v.verdict === "same") return sure ? "present-llm" : "review";
  return sure ? "missing" : "review";
}

function writeOutputs(entries, resolved, verdicts, catalogue) {
  const seconds = SECOND ? readVerdicts(resolve(DIR, SECOND)) : new Map();
  const byId = new Map([...catalogue.lenses.map((r) => [`lens:${r.id}`, r]), ...catalogue.cameras.map((r) => [`camera:${r.id}`, r])]);
  const table = (e) => (e.kind === "camera" ? "camera" : "lens");
  const all = entries.map((e) => {
    const d = resolved.get(e.url);
    if (d) return { ...e, status: "present", how: d.how, id: d.row.id, name: d.row.name };
    const v = verdicts.get(e.url);
    const s2 = seconds.get(e.url);
    const status = classify(v, s2);
    const ref = v?.match_id ?? v?.related_id;
    return {
      ...e, status, how: v ? "llm" : null,
      display_name: v?.display_name, brand: v?.brand, verdict: v?.verdict, confidence: v?.confidence,
      name_confidence: v?.name_confidence, is_edition: v?.is_edition, reason: v?.reason,
      ref_id: ref ?? null, ref_name: ref ? byId.get(`${table(e)}:${ref}`)?.name ?? null : null,
      candidates: v?.candidates,
      ...(s2 ? { second: { model: s2.model, verdict: s2.verdict, confidence: s2.confidence, ref_id: s2.match_id ?? s2.related_id ?? null, reason: s2.reason } } : {}),
    };
  });
  const count = {};
  for (const e of all) {
    count[e.kind] ??= {};
    count[e.kind][e.status] = (count[e.kind][e.status] ?? 0) + 1;
  }
  const missing = all.filter((e) => e.status === "missing");
  const review = all.filter((e) => e.status === "review");
  writeFileSync(resolve(DIR, "gaps.json"), JSON.stringify(all, null, 1));
  writeFileSync(resolve(DIR, "missing.json"), JSON.stringify(missing, null, 1));
  writeFileSync(resolve(DIR, "review.json"), JSON.stringify(review, null, 1));

  const line = (e) => `| ${e.kind} | ${e.display_name ?? e.slug} | ${e.verdict ?? ""} | ${e.confidence ?? ""} | ${e.is_edition ? "yes" : ""} | ${e.ref_name ?? ""} | ${e.url} |`;
  const md = [
    `# lens-db.com sitemap vs our catalogue`,
    ``,
    `Generated ${new Date().toISOString().slice(0, 10)} with ${MODEL}. Confidence bar ${CONFIDENT}.`,
    ``,
    `## Counts`,
    ``,
    "```",
    JSON.stringify(count, null, 2),
    "```",
    ``,
    `## Missing (${missing.length})`,
    ``,
    `| kind | name | verdict | confidence | edition | related row | url |`,
    `|---|---|---|---|---|---|---|`,
    ...missing.map(line),
    ``,
    `## Needs review (${review.length})`,
    ``,
    `| kind | name | verdict | confidence | edition | related row | url |`,
    `|---|---|---|---|---|---|---|`,
    ...review.map(line),
  ].join("\n");
  writeFileSync(resolve(DIR, "report.md"), md);
  console.log(JSON.stringify(count, null, 2));
  console.log(`missing ${missing.length}, review ${review.length} -> ${DIR}`);
}

async function main() {
  const sql = createSql();
  const catalogue = await loadCatalogue(sql);
  await sql.end?.();
  const idx = { lens: buildIndex(catalogue.lenses), camera: buildIndex(catalogue.cameras) };
  const entries = loadSitemap();

  const resolved = new Map();
  const open = [];
  for (const e of entries) {
    const d = deterministic(e, e.kind === "camera" ? idx.camera : idx.lens);
    if (d) resolved.set(e.url, d);
    else open.push(e);
  }
  const how = {};
  for (const d of resolved.values()) how[d.how] = (how[d.how] ?? 0) + 1;
  console.log(`sitemap ${entries.length}, resolved deterministically ${resolved.size}`, how, `unresolved ${open.length}`);

  const verdicts = readVerdicts();
  if (!NO_LLM && !REPORT_ONLY) {
    let todo = open.filter((e) => !verdicts.has(e.url));
    if (ONLY) {
      const keep = new Set(readFileSync(resolve(ONLY), "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
      todo = todo.filter((e) => keep.has(e.url));
    }
    if (LIMIT) todo = todo.slice(0, LIMIT);
    console.log(`judging ${todo.length} with ${MODEL}`);
    let done = 0;
    let failed = 0;
    const queue = [...todo];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const e = queue.shift();
        const cands = candidates(e, e.kind === "camera" ? idx.camera : idx.lens);
        try {
          const v = await judge(e, cands);
          const rec = { url: e.url, kind: e.kind, slug: e.slug, ...v, candidates: cands.map((r) => ({ id: r.id, name: r.name })), model: MODEL };
          appendFileSync(VERDICTS, JSON.stringify(rec) + "\n");
          verdicts.set(e.url, rec);
        } catch (err) {
          failed++;
          console.error(`fail ${e.slug}: ${err.message.slice(0, 120)}`);
        }
        if (++done % 50 === 0) console.log(`${done}/${todo.length}`);
      }
    }));
    console.log(`judged ${done - failed}, failed ${failed}`);
  }
  if (!NO_LLM && !args.includes("--verdicts")) writeOutputs(entries, resolved, verdicts, catalogue);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
