/**
 * mir.com.my Nikkor resources crawler.
 *
 * mir.com.my (Leofoo's "Nikkor Resources", co-developed with Rick Oleson and
 * Lars Holst Hansen) is the most complete free reference for manual-focus
 * Nikkor optics and Nikon bodies. It is hand-written HTML from the early
 * 2000s: no robots.txt, no JS, ~50KB pages, spec blocks written as plain
 * "Key: Value" lines inside <p>/<font> soup.
 *
 * WHAT THIS SCRIPT TAKES, AND WHAT IT DELIBERATELY DOES NOT
 * --------------------------------------------------------
 * Takes: facts. Model designations, introduction years, optical construction,
 * weights, dimensions, filter sizes, closest focus, angle of view, serial
 * ranges. Facts are not copyrightable and are exactly what our spec columns
 * want.
 *
 * Does NOT take: the prose or the photographs. The body copy is Leofoo's own
 * writing and most images carry an explicit third-party credit line ("Image(s)
 * copyright (c) 2008. All rights reserved. Please respect the visual property
 * of the contributing photographer"). Image URLs are recorded so a human can
 * ask for permission per page, but nothing is downloaded.
 *
 * Usage (from scraper/):
 *   node mir-nikkor-scrape.mjs                     # crawl, write mir-nikkor.json
 *   node mir-nikkor-scrape.mjs --limit 20          # short run while iterating
 *   node mir-nikkor-scrape.mjs --out other.json
 *   node mir-nikkor-scrape.mjs --delay 500         # ms between requests
 */

import { writeFileSync } from "node:fs";

const ROOT = "https://www.mir.com.my/rb/photography/companies/nikon/nikkoresources/";
// Bodies live outside the nikkoresources tree, under the "classics" hardware
// section, which also holds every other maker. The Nikon body pages there
// share templates with the Olympus and Canon ones (an OM Zuiko 24mm shift
// page is two hops from the PC-Nikkor index), so "classics" is only in scope
// where the path itself names a Nikon product line.
const ALLOWED_PREFIXES = ["https://www.mir.com.my/rb/photography/companies/nikon/"];
const CLASSICS_PREFIX = "https://www.mir.com.my/rb/photography/hardwares/classics/";
const NIKON_CLASSICS = /\/classics\/[^/]*(nikon|nikkormat|nikkorex|emfgfg)/i;

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const LIMIT = parseInt(argVal("--limit", "400"), 10);
const DELAY_MS = parseInt(argVal("--delay", "400"), 10);
const OUT = argVal("--out", "mir-nikkor.json");
const SEED = argVal("--seed", ROOT);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HTML → text, keeping line structure so "Key: Value" lines survive
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  deg: "°", times: "×", copy: "©", reg: "®",
  eacute: "é", uuml: "ü", ouml: "ö", auml: "ä",
  middot: "·", mdash: "—", ndash: "–", hellip: "…",
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? m : named;
  });
}

function htmlToText(html) {
  let t = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  // Block-ish tags become newlines so a spec line never merges with the next.
  t = t.replace(/<\s*(br|p|div|tr|li|h[1-6])\b[^>]*>/gi, "\n");
  t = t.replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n");
  t = t.replace(/<\s*\/?\s*t[dh]\b[^>]*>/gi, " ");
  t = t.replace(/<[^>]*>/g, " ");
  t = decodeEntities(t);
  t = t.replace(/[ \t ]+/g, " ");
  t = t.replace(/ *\n[ \n]*/g, "\n");
  return t.trim();
}

// ---------------------------------------------------------------------------
// Spec-block parsing
// ---------------------------------------------------------------------------

// The spec keys mir actually uses, mapped onto the vocabulary our `specs`
// JSONB already speaks. Anything not in here is kept under its own key.
const SPEC_KEYS = [
  "focal length", "maximum aperture", "minimum aperture", "lens construction",
  "picture angle", "angle of view", "distance scale", "aperture scale",
  "aperture diaphragm", "diaphragm", "meter coupling prong", "attachment size",
  "filter", "filters", "hood", "lens hood", "dimensions", "weight",
  "accessories", "mount", "focusing", "closest focusing distance",
  "minimum focus", "exposure measurement", "front lens cap", "rear lens cap",
  "lens case", "serial", "serial numbers", "introduced", "production",
  "number of diaphragm blades", "reproduction ratio", "magnification",
];
const SPEC_KEY_SET = new Set(SPEC_KEYS);

// "Specifications :", "Specification:", "Technical specifications" ...
const SPEC_HEADING = /^\s*(technical\s+)?specifications?\b/i;

// A spec value never runs on for a paragraph. Anything longer than this is
// prose that resumed after the block, so it gets cut back to a sentence end.
const MAX_VALUE_CHARS = 220;

// Captions and rules sit inside the spec block on some pages ("Fully
// automatic  < < < --- An early version, old NON-Ai..."); cut there.
const PROSE_MARKERS = [/<\s*<\s*</, /\s-{2,}\s/, /\bclick here\b/i];

function trimValue(raw) {
  let v = raw.replace(/\s+/g, " ").trim();
  for (const marker of PROSE_MARKERS) {
    const m = v.match(marker);
    if (m && m.index > 0) v = v.slice(0, m.index).trim();
  }
  v = v.replace(/[;,]$/, "");
  if (v.length <= MAX_VALUE_CHARS) return v;
  const cut = v.slice(0, MAX_VALUE_CHARS);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (stop > 40 ? cut.slice(0, stop) : cut).trim();
}

/**
 * mir writes spec blocks as a run of "Key : Value" pairs, but the line breaks
 * are cosmetic: two pairs often share a line ("Hood: Built-in; Dimensions:
 * 92mm dia..."), and one pair often wraps across three. So rather than parse
 * line by line, find every known key in the block and take each value as the
 * span up to the next known key.
 */
function parseSpecs(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => SPEC_HEADING.test(l));
  if (start === -1) return { specs: {}, specNote: null };

  const specNote = lines[start].replace(/^\s*(technical\s+)?specifications?\s*:?\s*/i, "").trim() || null;
  // A spec block is never longer than this; the rest of the page is prose.
  const block = lines.slice(start + 1, start + 80).join("\n");

  const keyPattern = new RegExp(
    `(?:^|[\\n\\s;])(${SPEC_KEYS.map((k) => k.replace(/ /g, "\\s+")).join("|")})\\s*:\\s*`,
    "gi",
  );
  const hits = [...block.matchAll(keyPattern)];
  const specs = {};
  for (let i = 0; i < hits.length; i++) {
    const key = hits[i][1].replace(/\s+/g, " ").trim();
    const from = hits[i].index + hits[i][0].length;
    const to = i + 1 < hits.length ? hits[i + 1].index : block.length;
    const value = trimValue(block.slice(from, to));
    // A repeated key means the page lists two versions; keep the first, which
    // is the one the heading introduced.
    const canonical = key[0].toUpperCase() + key.slice(1).toLowerCase();
    if (value && !specs[canonical]) specs[canonical] = value;
  }
  return { specs, specNote };
}

// ---------------------------------------------------------------------------
// Model designations and years
// ---------------------------------------------------------------------------

// "Nikkor-QD.C Auto f/5.6 15mm", "Zoom-Nikkor 80~200mm f/4.5", "Micro-Nikkor
// 55mm f/3.5", "AI-S Nikkor 15mm f/3.5" ... mir writes the mid-dot as ".".
const MODEL_RE =
  /\b((?:AI-?S?|Ai-?S?|New|Non-?Ai)?\s*(?:Micro-|Zoom-|Fisheye-|Reflex-|Medical-|Bellows-|OP-|UV-|PC-)?Nikkor(?:-[A-Z]{1,2}(?:[.·]C)?)?(?:\s+Auto)?)\s*(?:f\/?\s*([\d.]+)\s*)?(\d{1,4}(?:\s*[~-]\s*\d{1,4})?)\s*mm(?:\s*f\/?\s*([\d.]+))?/gi;

const MODEL_RE_FOCAL_FIRST =
  /\b(\d{1,4}(?:\s*[~-]\s*\d{1,4})?)\s*mm\s*(?:f\/?\s*([\d.]+)\s*)?((?:AI-?S?|Ai-?S?|New|Non-?Ai)?\s*(?:Micro-|Zoom-|Fisheye-|Reflex-|Medical-|Bellows-|OP-|UV-|PC-)?Nikkor(?:-[A-Z]{1,2}(?:[.\u00b7]C)?)?(?:\s+Auto)?)\s*(?:f\/?\s*([\d.]+))?/gi;

function extractModels(text) {
  const out = new Map();
  const add = (designation, focal, aperture) => {
    const d = designation.replace(/\s+/g, " ").trim();
    const f = focal.replace(/\s+/g, "").replace("~", "-");
    const key = `${d}|${f}|${aperture ?? ""}`;
    if (!out.has(key)) {
      out.set(key, { designation: d, focal: `${f}mm`, aperture: aperture ? `f/${aperture}` : null });
    }
  };
  for (const m of text.matchAll(MODEL_RE)) add(m[1], m[3], m[2] || m[4] || null);
  // mir also writes the focal length first: "the 15mm Nikkor-QD.C Auto f/5.6".
  for (const m of text.matchAll(MODEL_RE_FOCAL_FIRST)) add(m[3], m[1], m[2] || m[4] || null);
  return [...out.values()];
}

// "introduced ... back in 1973", "in 1973 it was", "(1959)"
function extractYears(text) {
  const years = new Set();
  for (const m of text.matchAll(/\b(19[3-9]\d|20[0-2]\d)\b/g)) {
    const y = parseInt(m[1], 10);
    // 2000s dates on these pages are usually image credits, not lens dates.
    if (y >= 1930 && y <= 2010) years.add(y);
  }
  return [...years].sort();
}

function extractIntroYear(text) {
  const m = text.match(
    /\b(?:introduced|released|announced|debut(?:ed)?|launched|came out|appeared)\b[^.]{0,60}?\b(19[3-9]\d|20[0-2]\d)\b/i,
  );
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

function absolutise(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function inScope(url) {
  if (!/\.(htm|html)$/i.test(url)) return false;
  if (ALLOWED_PREFIXES.some((p) => url.startsWith(p))) return true;
  return url.startsWith(CLASSICS_PREFIX) && NIKON_CLASSICS.test(url);
}

function extractLinks(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const abs = absolutise(m[1], base);
    if (abs && inScope(abs)) out.add(abs);
  }
  return [...out];
}

function extractImages(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
    const abs = absolutise(m[1], base);
    // The nav furniture (home buttons, name banners, search) is not content.
    if (abs && !/\/(images|htmls)\/(mirhome|leofoo|larsname|search_but|weblibrary)/i.test(abs)) {
      out.add(abs);
    }
  }
  return [...out];
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : null;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "thelensdb-research/1.0 (+https://thelensdb.com; contact florent@segouin.me)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  // These pages are iso-8859-1 and say so in a meta tag, not a header.
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder("iso-8859-1").decode(buf);
}

async function main() {
  const queue = [SEED];
  const seen = new Set(queue);
  const pages = [];
  const failures = [];

  while (queue.length && pages.length < LIMIT) {
    const url = queue.shift();
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      failures.push({ url, error: String(err.message || err) });
      continue;
    }

    const text = htmlToText(html);
    const { specs, specNote } = parseSpecs(text);
    const record = {
      url,
      title: extractTitle(html),
      isIndex: /\/index\w*\.html?$/i.test(url),
      introYear: extractIntroYear(text),
      years: extractYears(text),
      models: extractModels(text),
      specs,
      specNote,
      images: extractImages(html, url),
      textLength: text.length,
    };
    pages.push(record);

    for (const link of extractLinks(html, url)) {
      if (!seen.has(link)) {
        seen.add(link);
        queue.push(link);
      }
    }

    const specCount = Object.keys(specs).length;
    console.log(
      `[${pages.length}/${LIMIT}] ${specCount ? `${specCount} specs` : "no specs"}, ` +
        `${record.models.length} models · ${url.replace(ROOT, "")}`,
    );
    await delay(DELAY_MS);
  }

  const withSpecs = pages.filter((p) => Object.keys(p.specs).length > 0);
  writeFileSync(OUT, JSON.stringify({ crawledAt: new Date().toISOString(), root: SEED, pages, failures }, null, 2));
  console.log(
    `\nCrawled ${pages.length} pages (${withSpecs.length} with a spec block), ` +
      `${queue.length} left unvisited, ${failures.length} failures.\nWrote ${OUT}`,
  );
}

await main();
