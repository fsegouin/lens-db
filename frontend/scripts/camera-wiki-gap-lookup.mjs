/**
 * Look up the lens-db gaps still awaiting review on camera-wiki.org.
 *
 * Two models' recall leaves obscure lenses thin: nobody remembers the weight
 * of a Sun 135mm f/3.5, but camera-wiki has an article with it. This finds the
 * article for each pending lens and reads its figures, so enrich-lensdb-gaps
 * can treat them as a published source: a field the models disagreed on or
 * did not know is taken from the article and cited to it.
 *
 * camera-wiki is a MediaWiki; this uses api.php, never page scraping. Its
 * search finds little for lens names, and of its ~10,000 articles fewer than a
 * hundred are about one lens ("Sun 135mm f/3.5"); most lenses appear only on a
 * maker or lens-line page ("Sun Kōki", "Tessar"). So:
 *   1. the title list is fetched once (list=allpages, ~20 requests) and cached
 *      as camerawiki-titles.json;
 *   2. candidates are matched locally: a single-lens title with the same focal
 *      length, aperture and a name word, else a page titled with the maker or
 *      a word of the lens line;
 *   3. the candidates' wikitext comes in batches of 50 titles, one request a
 *      second. A maker page is cut to the passages that mention the focal length.
 * It stops at the first non-200. Only figures are taken, never prose: the
 * articles are CC BY-SA and facts are not (see lib/camera-wiki-facts.mjs).
 *
 * A model reads the lens-db name beside up to three articles and says which
 * one, if any, is this exact lens, then extracts only values the article
 * states. Output: camerawiki-lookup.jsonl in --dir (resumable).
 *
 * Usage (from frontend/):
 *   node scripts/camera-wiki-gap-lookup.mjs --limit 5
 *   node scripts/camera-wiki-gap-lookup.mjs
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, appendFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { toPlainText } from "./lib/camera-wiki-facts.mjs";
import { COVERAGE } from "../src/lib/vocabularies.ts";

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
const OUT = join(DIR, "camerawiki-lookup.jsonl");

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; contact@thelensdb.com)";
const PAUSE_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requests = 0;
async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: "json" })) url.searchParams.set(k, v);
  requests++;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`camera-wiki answered ${res.status}; stopping (requests so far: ${requests})`);
  await sleep(PAUSE_MS);
  return res.json();
}

async function fetchArticles(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    // Past the API's result-size limit a batch comes back with some pages'
    // content missing and a `continue` for the rest; unfollowed, those lenses
    // would be recorded as having no article.
    let cont = {};
    while (cont) {
      const data = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: batch.join("|"), redirects: "1", ...cont });
      const alias = new Map();
      for (const n of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) alias.set(n.to, n.from);
      for (const page of Object.values(data.query?.pages ?? {})) {
        const content = page.revisions?.[0]?.slots?.main?.["*"];
        if (!content) continue;
        let t = page.title;
        out.set(t, content);
        while (alias.has(t)) { t = alias.get(t); out.set(t, content); }
      }
      cont = data.continue ?? null;
    }
  }
  return out;
}

function lookupSchema(systems) {
  const v = (s, what) => s.nullable().describe(what);
  return z.object({
    article: z.number().nullable().describe("Index of the article that is about this exact lens, or null if none is"),
    confidence: z.number().describe("0-1: how sure you are the chosen article is this exact lens (version, mount and maker)"),
    reason: z.string().describe("One sentence"),
    fields: z.object({
      year_introduced: v(z.number(), "Year introduced, only if the article states it"),
      weight_g: v(z.number(), "Weight in grams, only if stated (convert ounces)"),
      filter_size_mm: v(z.number(), "Filter thread in mm, only if stated"),
      min_focus_distance_m: v(z.number(), "Closest focus in metres, only if stated (convert feet)"),
      max_magnification: v(z.number(), "Maximum magnification ratio, only if stated"),
      lens_elements: v(z.number(), "Number of elements, only if stated"),
      lens_groups: v(z.number(), "Number of groups, only if stated"),
      diaphragm_blades: v(z.number(), "Number of aperture blades, only if stated"),
      coverage: v(z.enum(COVERAGE), "Image circle, only if the article makes it clear"),
      mounts: z.array(z.enum(systems)).describe("Mounts the article says this lens was made in, from the list; empty if not stated"),
    }),
  });
}

const SYSTEM = `You match a catalogue entry for a photographic lens to camera-wiki.org articles and read figures out of the matching one.

First decide which article, if any, is about this exact lens: same maker or brand, focal length, maximum aperture, and the same version where the name gives one. An article about a lens family is acceptable only if it gives figures for this lens specifically. If none matches, return article null and no figures.

Then copy only values the article states for this lens. Never infer, estimate or fill from general knowledge: a field the article does not state is null. Convert imperial units to metric. Mounts come only from the allowed list, and only when the article names them.`;

function readDone() {
  const done = new Set();
  if (!existsSync(OUT)) return done;
  for (const line of readFileSync(OUT, "utf8").split("\n")) if (line.trim()) done.add(JSON.parse(line).url);
  return done;
}

async function main() {
  const enriched = JSON.parse(readFileSync(join(DIR, "enriched.json"), "utf8"));
  const sql = createSql();
  const systems = (await sql`SELECT name FROM systems ORDER BY name`).map((r) => r.name);
  const done = readDone();
  const decisionsDir = join(DIR, "decisions-export/decisions");
  const decided = new Set(existsSync(decisionsDir) ? readdirSync(decisionsDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);
  const itemId = (r) => `lens--${r.slug}`.slice(0, 190);
  let todo = enriched.filter((r) => r.kind !== "camera" && r.status !== "ready" && !done.has(r.url) && !decided.has(itemId(r)));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`pending lenses to look up: ${todo.length}`);

  // 1. candidates from the cached title index
  const titlesFile = join(DIR, "camerawiki-titles.json");
  let titles;
  if (existsSync(titlesFile)) titles = JSON.parse(readFileSync(titlesFile, "utf8"));
  else {
    titles = [];
    let cont = null;
    do {
      const data = await api({ action: "query", list: "allpages", aplimit: "500", apnamespace: "0", apfilterredir: "nonredirects", ...(cont ? { apcontinue: cont } : {}) });
      titles.push(...(data.query?.allpages ?? []).map((p) => p.title));
      cont = data.continue?.apcontinue;
    } while (cont);
    writeFileSync(titlesFile, JSON.stringify(titles));
  }
  const lower = titles.map((t) => [t, t.toLowerCase()]);
  const hits = new Map();
  for (const r of todo) {
    const focal = r.name.match(/(\d+(?:\.\d+)?(?:-\d+)?)\s*mm/i)?.[1];
    const ap = r.name.match(/F\/?(\d+(?:\.\d+)?)/)?.[1];
    const brand = String(r.fields?.brand?.value ?? r.name.split(" ")[0]).toLowerCase();
    const words = r.name.split(/\d+(?:\.\d+)?(?:-\d+)?\s*mm/i)[0].toLowerCase().split(/[\s/]+/).filter((w) => w.length > 2);
    const apRe = ap ? new RegExp(`f/?\\s*${ap.replace(".", "\\.")}(?![\\d.])`) : null;
    const single = focal && apRe
      ? lower.filter(([, tl]) => tl.replace(/ mm/g, "mm").includes(`${focal}mm`) && apRe.test(tl) && [...words, brand].some((w) => tl.includes(w))).map(([t]) => t)
      : [];
    const family = lower.filter(([, tl]) => tl === brand || tl === `${brand} lenses` || words.includes(tl)).map(([t]) => t);
    hits.set(r.url, { single: single.slice(0, 2), family: family.slice(0, 2), focal });
  }
  // 2. articles
  const allTitles = [...new Set([...hits.values()].flatMap((h) => [...h.single, ...h.family]))];
  const articles = await fetchArticles(allTitles);
  console.log(`${todo.length} lenses: ${[...hits.values()].filter((h) => h.single.length).length} with a single-lens article, ${[...hits.values()].filter((h) => !h.single.length && h.family.length).length} with a maker or line page only; ${articles.size} articles fetched in ${requests} requests`);

  /** A maker page cut to the passages that mention this focal length. */
  const passages = (text, focal) => {
    if (!focal) return "";
    const re = new RegExp(`${focal.replace(".", "\\.")}\\s*mm`, "gi");
    const out = [];
    let m;
    while ((m = re.exec(text)) && out.join("").length < 3000) out.push(text.slice(Math.max(0, m.index - 500), m.index + 700));
    return out.join("\n…\n");
  };

  // 3. match and extract
  const schema = lookupSchema(systems);
  let matched = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const r = queue.shift();
      const h = hits.get(r.url);
      const docsList = [
        ...h.single.filter((t) => articles.has(t)).map((t) => [t, toPlainText(articles.get(t)).slice(0, 6000)]),
        ...h.family.filter((t) => articles.has(t)).map((t) => [t, passages(toPlainText(articles.get(t)), h.focal)]).filter(([, x]) => x),
      ];
      const docTitles = docsList.map(([t]) => t);
      if (!docTitles.length) {
        appendFileSync(OUT, JSON.stringify({ url: r.url, name: r.name, title: null, article: null, fields: null }) + "\n");
        continue;
      }
      const docs = docsList.map(([t, x], i) => `### Article ${i}: ${t}\n${x}`).join("\n\n");
      try {
        const { output } = await generateText({
          model: MODEL, system: SYSTEM, temperature: 0, timeout: 90_000,
          prompt: `Catalogue entry: ${r.name}\n(lens-db.com slug: ${r.slug})\n\n${docs}`,
          output: Output.object({ schema }),
        });
        const title = output.article != null ? docTitles[output.article] ?? null : null;
        if (title && output.confidence >= 0.8) matched++;
        appendFileSync(OUT, JSON.stringify({
          url: r.url, name: r.name, title,
          article: title ? `https://camera-wiki.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/")}` : null,
          confidence: output.confidence, reason: output.reason, fields: title ? output.fields : null, model: MODEL,
        }) + "\n");
      } catch (e) {
        console.error(`fail ${r.slug}: ${e.message.slice(0, 140)}`);
      }
    }
  }));
  console.log(`matched ${matched} of ${todo.length} with confidence >= 0.8`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
