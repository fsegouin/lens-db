/**
 * kenrockwell.com lens review crawler.
 *
 * Ken Rockwell has reviewed several hundred lenses across Nikon, Canon, Sony,
 * LEICA, Zeiss and the third parties, and each review carries what our
 * brochure-derived rows lack: the years a lens was made, how to tell its
 * versions apart, a dated used price, and a plain verdict on sharpness,
 * distortion and bokeh.
 *
 * WHAT THIS SCRIPT TAKES, AND WHAT IT DELIBERATELY DOES NOT
 * --------------------------------------------------------
 * Takes: facts, into typed fields. Name, years, elements and groups, blades,
 * close focus, magnification, filter thread, size, weight, prices with their
 * dates. Facts are not copyrightable and are what our spec columns want.
 *
 * Keeps, locally only: the text of the Introduction, Performance and
 * Recommendations sections, so a later pass can write OUR OWN description
 * from what he found. His prose is his and is never published; the output
 * file is gitignored and nothing in it is copied to the site as-is.
 *
 * Does not take: photographs. Nothing but HTML is fetched.
 *
 * HOW IT FETCHES
 * --------------
 * The live site sits behind a Cloudflare challenge that rejects any client
 * without a browser's JavaScript, so pages are read from the Wayback Machine,
 * which holds current copies (the pancake review's archive of Feb 2026 is
 * byte-identical in text to the live page). Two calls per page at most: the
 * CDX index lists every captured URL under a directory, and `id_` snapshots
 * return the original HTML without the archive's toolbar. Everything fetched
 * is cached on disk, so a rerun costs nothing and a crash resumes.
 *
 * Usage (from scraper/):
 *   node kenrockwell-scrape.mjs                    # every brand, write kenrockwell.json
 *   node kenrockwell-scrape.mjs --dirs nikon,leica # some brands
 *   node kenrockwell-scrape.mjs --limit 20         # short run while iterating
 *   node kenrockwell-scrape.mjs --delay 1500       # ms between archive requests
 *   node kenrockwell-scrape.mjs --reparse          # rebuild the JSON from cache, no fetching
 *   node kenrockwell-scrape.mjs --kind cameras     # his camera reviews, to kenrockwell-cameras.json
 *
 * Camera reviews have no focal length in their file name, so --kind cameras
 * takes every other page under the brand directories that is not an obvious
 * article or sub-page, fetches it, and lets the specification labels say
 * what it is: sensor, shutter and viewfinder make a camera; optics,
 * diaphragm and close focus make a lens (his older lens reviews are named
 * "80200.htm" and turn up here too); neither makes an article. The `kind`
 * field carries that verdict.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// His site files each brand under its own directory. `tech` and the camera
// pages are not crawled: this is the lens inventory.
const DIRS = [
  "nikon", "canon", "sony", "fuji", "leica", "zeiss", "olympus", "pentax",
  "minolta", "contax", "hasselblad", "mamiya", "tamron", "sigma", "tokina",
  "voigtlander", "rokinon", "samyang",
];

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const LIMIT = parseInt(argVal("--limit", "100000"), 10);
const DELAY_MS = parseInt(argVal("--delay", "1500"), 10);
const KIND = argVal("--kind", "lenses");
const OUT = argVal("--out", KIND === "cameras" ? "kenrockwell-cameras.json" : "kenrockwell.json");
const ONLY_DIRS = argVal("--dirs", null)?.split(",").map((d) => d.trim()).filter(Boolean);
const REPARSE = args.includes("--reparse");
const DEBUG = args.includes("--debug");
const CACHE = join(dirname(new URL(import.meta.url).pathname), "kenrockwell-cache");

const UA = "Mozilla/5.0 (compatible; thelensdb.com catalogue crawler; florent@segouin.me)";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
      if (res.status === 404) return { status: 404, text: "" };
      if (res.ok) return { status: 200, text: await res.text() };
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await delay(DELAY_MS * 2 ** (attempt + 1));
        continue;
      }
      return { status: res.status, text: "" };
    } catch (err) {
      if (attempt >= retries) return { status: 0, text: String(err) };
      await delay(DELAY_MS * 2 ** (attempt + 1));
    }
  }
}

function cachePath(...parts) {
  const p = join(CACHE, ...parts);
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

// ---------------------------------------------------------------------------
// Inventory: which pages exist under each brand directory
// ---------------------------------------------------------------------------

// Sub-pages of a review (comparisons, falloff and sharpness galleries, image
// directories) and the brand index pages are not reviews of one lens.
const NOT_A_REVIEW =
  /compar|versus|-vs-|history|falloff|sharpness|bokeh|coma|sunstar|flare|distortion|sample|\/images\/|users?-guide|\/gallery|lenses\.html?$|index\.html?$/i;

// Articles, films, accessories and per-topic sub-pages of a camera review.
const NOT_A_CAMERA =
  /how-to|settings|menu|firmware|recommended|autofocus|\/iso|noise|dynamic|battery|flash|accessor|hood|filter|strap|\/case|\/bag|tripod|grip|adapter|manual|news|\/vs|velvia|provia|astia|fortia|acros|film|serial|names|cult|dollar|conversion|meter|tube|date-code|-man\.|index-new|end\.htm|skydive|color\.htm|simulation/i;

/**
 * Every page under a brand directory, with the timestamp of its newest good
 * capture. Since mid-2025 the archive's crawler has been hitting the
 * Cloudflare wall too, so a page's newest capture is as likely to be a 403
 * as the page; the listing is therefore taken uncollapsed, 200s only, and
 * the last timestamp per page wins. About 120 KB for the largest brand.
 */
async function inventory(dir) {
  const file = cachePath(`cdx200-${dir}.json`);
  let rows;
  if (existsSync(file)) {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } else {
    const url =
      `https://web.archive.org/cdx/search/cdx?url=kenrockwell.com/${dir}/*` +
      `&output=json&fl=original,timestamp&filter=statuscode:200&filter=mimetype:text/html&from=2015`;
    const { status, text } = await fetchText(url, { retries: 2 });
    if (status !== 200) {
      console.warn(`  cdx ${dir}: HTTP ${status}, skipped (rerun to retry)`);
      return [];
    }
    rows = text ? JSON.parse(text).slice(1) : [];
    writeFileSync(file, JSON.stringify(rows));
    await delay(DELAY_MS);
  }
  const newest = new Map();
  for (const [original, timestamp] of rows) {
    const path = original
      .split(/[?#]/)[0]
      .replace(/^https?:\/\/(www\.)?kenrockwell\.com(:80)?\//i, "")
      .replace(/\/{2,}/g, "/")
      .replace(/^\//, "")
      .toLowerCase();
    if (!/\.html?$/.test(path)) continue;
    // A lens review's file name carries its focal length ("50mm-f14.htm",
    // "18-55mm-vr.htm"); camera and article pages do not.
    const lensName = /\d+(\.\d+)?mm|\d+-\d+/.test(path);
    if (KIND === "cameras" ? lensName || NOT_A_CAMERA.test(path) || path.split("/").length > 4 : !lensName) continue;
    if (NOT_A_REVIEW.test(path)) continue;
    if (!newest.has(path) || newest.get(path) < timestamp) newest.set(path, timestamp);
  }
  return [...newest.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** A capture that is the Cloudflare wall rather than the page. */
function isChallenge(html) {
  return /<title>\s*Just a moment/i.test(html) || /challenges\.cloudflare\.com/.test(html.slice(0, 4000));
}

// ---------------------------------------------------------------------------
// HTML → text, keeping line structure so the labelled spec entries survive
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  deg: "°", times: "×", copy: "©", reg: "®", trade: "™",
  eacute: "é", uuml: "ü", ouml: "ö", auml: "ä", frac12: "½", frac14: "¼",
  middot: "·", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] === "#") {
      const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? m : named;
  });
}

function htmlToText(html) {
  let t = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<\s*(br|p|div|tr|li|h[1-6]|table)\b[^>]*>/gi, "\n");
  t = t.replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n");
  t = t.replace(/<\s*\/?\s*t[dh]\b[^>]*>/gi, " ");
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  t = t.replace(/[ \t ]+/g, " ");
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parsing one review
// ---------------------------------------------------------------------------

const SPEC_LABELS = [
  "Name", "Optics", "Diaphragm", "Aperture Ring", "Maximum Aperture", "Focal Length", "Angle of View",
  "Focus", "Autofocus", "Manual Focus", "Focus Scale", "Infinity Focus Stop", "Depth of Field Scale",
  "Reproduction Ratio Scale", "Infrared Focus Index", "Close Focus", "Closest Focus", "Maximum Reproduction Ratio",
  "Image Stabilization", "Caps", "Filters", "Filter Thread", "Hood", "Case", "Size", "Weight", "Quality",
  "Made in", "Price", "Price, USA", "Coverage", "Mount", "Introduced", "Announced", "Weather Sealing",
  "Included", "Packaging", "Box", "Coatings", "Teleconverters", "Tripod Collar", "Rated Weight",
];
const CAMERA_LABELS = [
  "Sensor", "Image Sensor", "Resolution", "Pixels", "Megapixels", "Lens Mount", "Lens", "Lenses", "Shutter", "Shutter Speeds",
  "Flash Sync", "Sync", "Flash", "ISO", "Sensitivity", "Frame Rate", "Frame Rates", "Viewfinder", "Finder", "Rear LCD", "LCD",
  "Screen", "Display", "Metering", "Meter", "Exposure", "Exposure Modes", "Movies", "Video", "Memory", "Card", "Cards",
  "Storage", "Battery", "Batteries", "Power", "Data", "Connections", "Ports", "Image Stabilizer", "Format", "Film",
  "Body", "Finish", "Construction", "Accessories", "Self Timer", "Drive", "Bracketing", "White Balance", "Audio",
  "Wireless", "Bluetooth", "GPS", "Dimensions", "Environmental", "Weather Sealing",
];
const LABEL_SET = new Set([...SPEC_LABELS, ...CAMERA_LABELS].map((l) => l.toLowerCase()));
const CAMERA_LABEL_SET = new Set(CAMERA_LABELS.map((l) => l.toLowerCase()));
const LENS_LABEL_SET = new Set(["optics", "diaphragm", "close focus", "closest focus", "filters", "filter thread", "focal length", "maximum reproduction ratio", "angle of view", "aperture ring"]);

const SECTION_HEADINGS = /^(Introduction|Intro|Sample Images?|Identification|Format|Compatibility|Specifications|Specs|Performance|Compared|Comparisons?|User'?s Guide|Usage|Recommendations|Deployment|More|Help Me Help You|Accessories|Versions|History|Missing|New|Good|Bad)$/i;

/**
 * A heading line, stripped of the "top" back-link and the "specifications" /
 * "performance" suffix newer pages put on every entry ("Optics specifications
 * top", "Bokeh performance top"), and of any parenthetical.
 */
function headingOf(line) {
  return line
    .replace(/\s+top$/i, "")
    // "Optics specifications" → "Optics", but "Specifications" stays itself.
    .replace(/^(.+?)\s+(specifications|performance)$/i, "$1")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

/** The lines of one section, from its heading to the next heading. */
function sectionLines(lines, heading) {
  const h = heading.toLowerCase();
  // The heading also appears in the navigation strips, alone on a line on
  // some pages, and older pages repeat "Performance top" over every
  // sub-section. The section itself is the first occurrence that is followed
  // by a real paragraph.
  // A navigation strip can put the heading alone on a line too, but what
  // follows it there is a few lines of links; the section itself is the
  // occurrence with the most text before the next heading.
  const fromStart = (start) => {
    const out = [];
    for (let i = start + 1; i < lines.length; i++) {
      const bare = headingOf(lines[i]);
      // The strip under a heading wraps, leaving its last item alone on a
      // line ("Recommendations"); a heading right after a strip line is that,
      // not the next section.
      const inStrip = i > 0 && NAV_LINE.test(lines[i - 1]) && /\s/.test(lines[i - 1].trim());
      if (bare.length < 40 && SECTION_HEADINGS.test(bare) && bare.toLowerCase() !== h && !inStrip) {
        // The introduction's own "New / Good / Bad" sub-lists are part of it.
        if (!(/^Intro/i.test(heading) && /^(New|Good|Bad|Missing)$/i.test(bare))) break;
      }
      out.push(lines[i]);
    }
    return out;
  };
  let best = [];
  let bestLength = -1;
  lines.forEach((l, i) => {
    if (headingOf(l).toLowerCase() !== h) return;
    const section = fromStart(i);
    const length = prose(section).length;
    if (length > bestLength) {
      best = section;
      bestLength = length;
    }
  });
  return best;
}

const NAV_WORD = "Home|Donate|New|Search|Gallery|Reviews|How.?To|Books|Links|Workshops|About|Contact|Top|Intro|Introduction|Specs|Specifications|Performance|Recommendations|Compared|Comparisons?|Usage|Samples?|Sample Images?|Format|Compatibility|Identification|More|Good|Bad|Missing|Accessories|Versions|User's Guide|Deployment|History";
const NAV_LINE = new RegExp(`^(${NAV_WORD})(\\s+(${NAV_WORD}))*$`, "i");
const SHOP_LINE = /approved sources|How to Win at eBay|Adorama|B&H|Crutchfield|junk-free|help me help you|I buy only|PayPal|copyrighted and formally registered/i;

/** Body text with the shop talk, navigation strips and picture captions left out. */
function prose(lines) {
  return lines
    .filter((l) => !NAV_LINE.test(l))
    .filter((l) => !SHOP_LINE.test(l))
    .filter((l) => !/\bbigger\b|full.resolution|camera-original|enlarge\b|Vergrößern/i.test(l) || l.length > 220)
    .join("\n")
    .trim();
}

function parseSpecs(lines) {
  const specs = {};
  let label = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Newer pages mark every entry "<Label> specifications top"; older ones
    // rely on the label being one of a known set.
    const asLabel = headingOf(line).replace(/:$/, "").trim();
    const marked = /specifications\s+top$/i.test(line);
    if ((marked && asLabel.length <= 40) || (asLabel.length <= 30 && LABEL_SET.has(asLabel.toLowerCase()))) {
      label = asLabel;
      if (!(label in specs)) specs[label] = "";
      continue;
    }
    if (!label) continue;
    if (/\bbigger\b|enlarge\b/i.test(line) && line.length < 160) continue; // picture caption
    specs[label] = specs[label] ? `${specs[label]} ${line}` : line;
  }
  for (const k of Object.keys(specs)) {
    specs[k] = specs[k].replace(/\s+/g, " ").trim();
    if (!specs[k]) delete specs[k];
  }
  return specs;
}

const num = (m) => (m ? parseFloat(m[1]) : null);

/**
 * The line under the title reads like
 *   "Nikon 85mm f/1.8 AF-S G (67mm filters, 12.4 oz./351g, 2.6'/0.8m close
 *    focus, $427 new or about $325 used if you know How to Win at eBay)."
 * and is the most consistently formatted fact on the site.
 */
function parseSummary(line) {
  const m = line.match(/^(.*?)\s*\(([^()]*(?:filters|oz\.|close focus|\$)[^()]*)\)/i);
  if (!m) return null;
  // "1,234" → "1234" so a thousands separator never truncates a number.
  const inside = m[2].replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const out = { name: m[1].trim(), raw: m[2] };
  out.filterMm = num(inside.match(/(\d+(?:\.\d+)?)\s*mm filters?/i));
  out.weightG = num(inside.match(/(\d+(?:\.\d+)?)\s*g\b/i));
  // "2.6'/0.8m close focus" or "0.45 m close focus": the metric half.
  out.minFocusM = num(inside.match(/\/\s*(\d+(?:\.\d+)?)\s*m\b/i)) ?? num(inside.match(/(\d+(?:\.\d+)?)\s*m(?:eters)?\s+close/i));
  const used = inside.match(/\$\s?(\d+(?:\.\d+)?)\s*used/i);
  const fresh = inside.match(/\$\s?(\d+(?:\.\d+)?)\s*(?:new\b|$|,|\)|or\b)/i);
  out.priceUsedUsd = used ? parseFloat(used[1]) : null;
  out.priceNewUsd = fresh ? parseFloat(fresh[1]) : null;
  return out;
}

function parsePage(path, html) {
  const lines = htmlToText(html).split("\n");
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const h1 = lines.find((l) => l.length > 3 && !NAV_LINE.test(l) && !/^Home\b/.test(l)) ?? "";

  // Years live in the header strip: "(2012-)", "(1980-1982 Japan)", "(1977-1995)".
  const head = lines.slice(0, 25).join(" ");
  const years = head.match(/\((\d{4})\s*[-–~]\s*(\d{4})?\s*([A-Za-z ]*)\)/);
  const summaryLine = lines.slice(0, 40).find((l) => /\((?:[^()]*)(filters|oz\.|close focus|MP\b|megapixel)/i.test(l));
  const summary = summaryLine ? parseSummary(summaryLine) : null;

  // "November 2019 Nikon Reviews Nikon Lenses All Reviews": the review date.
  const dated = lines.slice(0, 60).find((l) => /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/.test(l));
  const reviewed = dated ? dated.match(/^([A-Z][a-z]+\s+\d{4})/)[1] : null;

  const specLines = sectionLines(lines, "Specifications");
  const specs = parseSpecs(specLines.length ? specLines : sectionLines(lines, "Specs"));
  const optics = (specs.Optics ?? "").match(/(\d+)\s*elements?\s*(?:in|,)\s*(\d+)\s*groups?/i);
  const blades = (specs.Diaphragm ?? "").match(/(\d+)\s*(?:rounded|straight|standard|curved|conventional)?\s*blades?/i);
  // A zoom lists one distance per focal length; the column wants the nearest.
  const focusDistances = [...(specs["Close Focus"] ?? specs["Closest Focus"] ?? "").matchAll(/(\d+(?:\.\d+)?)\s*m(?:eters?)?\b/gi)]
    .map((m) => parseFloat(m[1]))
    .filter((v) => v > 0.05 && v < 50);
  const closeFocus = focusDistances.length ? [null, String(Math.min(...focusDistances))] : null;
  const ratio = (specs["Maximum Reproduction Ratio"] ?? "").match(/1\s*:\s*(\d+(?:\.\d+)?)/);
  // Threads are whole millimetres from 19 to 127; "0.75mm" is a pitch.
  const filter = (specs.Filters ?? specs["Filter Thread"] ?? "").match(/(?<![\d.])(\d{2,3})\s*mm/i);
  // "2,400 g": drop the thousands separator or the match reads 400.
  const weight = (specs.Weight ?? "").replace(/(\d),(\d{3})(?!\d)/g, "$1$2").match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const sizeMm = (specs.Size ?? "").match(/(\d+(?:\.\d+)?)\s*mm\s*(?:maximum\s*)?diameter\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm/i);
  const prices = [];
  for (const m of (specs.Price ?? specs["Price, USA"] ?? "").matchAll(/\$\s?(\d[\d,]*)\s*([^.$]*?)(?:,\s*)?((?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{4})/g)) {
    prices.push({ usd: parseFloat(m[1].replace(/,/g, "")), note: m[2].trim().slice(0, 60), when: m[3].trim() });
  }

  const labels = Object.keys(specs).map((k) => k.toLowerCase());
  const cameraScore = labels.filter((k) => CAMERA_LABEL_SET.has(k)).length;
  const lensScore = labels.filter((k) => LENS_LABEL_SET.has(k)).length;
  const kind = cameraScore >= 3 && cameraScore > lensScore ? "camera" : lensScore >= 2 && lensScore >= cameraScore ? "lens" : "other";
  const sensorText = `${specs.Sensor ?? specs["Image Sensor"] ?? ""} ${specs.Resolution ?? specs.Pixels ?? specs.Megapixels ?? ""}`;
  const megapixels = sensorText.match(/(\d+(?:\.\d+)?)\s*(?:MP\b|megapixels?|million)/i);
  const sensorSize = sensorText.match(/full[- ]frame|aps-c|aps-h|micro four thirds|four thirds|medium format|1\/2\.3|1\/1\.7|1"|1-inch|(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*mm)/i);

  return {
    url: `https://www.kenrockwell.com/${path}`,
    brandDir: path.split("/")[0],
    kind,
    camera: kind === "camera" ? {
      megapixels: megapixels ? parseFloat(megapixels[1]) : null,
      sensor: sensorSize ? sensorSize[0] : null,
      sensorText: sensorText.replace(/\s+/g, " ").trim().slice(0, 200) || null,
      mount: (specs["Lens Mount"] ?? specs.Mount ?? "").slice(0, 120) || null,
      shutter: (specs.Shutter ?? specs["Shutter Speeds"] ?? "").slice(0, 200) || null,
      viewfinder: (specs.Viewfinder ?? specs.Finder ?? "").slice(0, 200) || null,
    } : undefined,
    title,
    heading: h1,
    yearFrom: years ? parseInt(years[1], 10) : null,
    yearTo: years?.[2] ? parseInt(years[2], 10) : null,
    yearNote: years?.[3]?.trim() || null,
    reviewed,
    summary,
    specs,
    facts: {
      elements: optics ? parseInt(optics[1], 10) : null,
      groups: optics ? parseInt(optics[2], 10) : null,
      blades: blades ? parseInt(blades[1], 10) : null,
      minFocusM: closeFocus ? parseFloat(closeFocus[1]) : summary?.minFocusM ?? null,
      maxMagnification: ratio ? Math.round((1 / parseFloat(ratio[1])) * 1000) / 1000 : null,
      filterMm: filter ? parseFloat(filter[1]) : summary?.filterMm ?? null,
      weightG: weight ? parseFloat(weight[1]) : summary?.weightG ?? null,
      diameterMm: sizeMm ? parseFloat(sizeMm[1]) : null,
      lengthMm: sizeMm ? parseFloat(sizeMm[2]) : null,
      prices,
    },
    hasSpecs: Object.keys(specs).length >= 3,
    // Kept for writing our own text later; never published.
    text: {
      intro: prose(sectionLines(lines, "Introduction").length ? sectionLines(lines, "Introduction") : sectionLines(lines, "Intro")).slice(0, 8000),
      usage: KIND === "cameras" ? prose(sectionLines(lines, "Usage").length ? sectionLines(lines, "Usage") : sectionLines(lines, "User's Guide")).slice(0, 6000) : undefined,
      compared: KIND === "cameras" ? prose(sectionLines(lines, "Compared")).slice(0, 4000) : undefined,
      identification: prose(sectionLines(lines, "Identification")).slice(0, 4000),
      performance: prose(sectionLines(lines, "Performance")).slice(0, 12000),
      recommendations: prose(sectionLines(lines, "Recommendations")).slice(0, 4000),
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dirs = ONLY_DIRS ?? DIRS;
  const pages = [];
  const failures = [];
  let fetched = 0;

  for (const dir of dirs) {
    const paths = REPARSE
      ? existsSync(cachePath(`cdx200-${dir}.json`)) ? await inventory(dir) : []
      : await inventory(dir);
    console.log(`${dir}: ${paths.length} candidate pages`);
    for (const [path, timestamp] of paths) {
      if (fetched >= LIMIT) break;
      const file = cachePath("pages", `${path}.html`);
      let html;
      if (existsSync(file) && !isChallenge(readFileSync(file, "utf8"))) {
        html = readFileSync(file, "utf8");
      } else if (REPARSE) {
        continue;
      } else {
        const { status, text } = await fetchText(`https://web.archive.org/web/${timestamp}id_/https://www.kenrockwell.com/${path}`);
        fetched += 1;
        await delay(DELAY_MS);
        if (status !== 200 || text.length < 2000 || isChallenge(text)) {
          failures.push({ path, status, bytes: text.length, challenge: isChallenge(text) });
          console.log(`  ${path}: HTTP ${status}${isChallenge(text) ? " (Cloudflare wall)" : ""}`);
          continue;
        }
        html = text;
        writeFileSync(file, html);
      }
      const page = parsePage(path, html);
      if (DEBUG) {
        const lines = htmlToText(html).split("\n");
        for (const h of ["Introduction", "Specifications", "Performance", "Recommendations"]) {
          const at = lines.map((l, i) => [headingOf(l), i]).filter(([x]) => x.toLowerCase() === h.toLowerCase()).map(([, i]) => i);
          console.log(`  ${path} ${h}: at lines ${at.join(",") || "none"}; section ${sectionLines(lines, h).length} lines`);
        }
        console.log(`  spec labels: ${Object.keys(page.specs).join(" | ")}`);
      }
      pages.push(page);
    }
  }

  const reviews = pages.filter((p) => p.hasSpecs);
  if (KIND === "cameras") {
    const kinds = {};
    for (const p of pages) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
    console.log(`\nkinds: ${JSON.stringify(kinds)}`);
  }
  writeFileSync(OUT, JSON.stringify({ crawledAt: new Date().toISOString(), pages }, null, 1));
  console.log(`\n${pages.length} pages parsed, ${reviews.length} with a specifications section, ${failures.length} failed`);
  console.log(`  with elements/groups: ${reviews.filter((p) => p.facts.elements).length}`);
  console.log(`  with close focus:     ${reviews.filter((p) => p.facts.minFocusM).length}`);
  console.log(`  with weight:          ${reviews.filter((p) => p.facts.weightG).length}`);
  console.log(`  with a dated price:   ${reviews.filter((p) => p.facts.prices.length).length}`);
  console.log(`  with years:           ${reviews.filter((p) => p.yearFrom).length}`);
  if (failures.length) writeFileSync(OUT.replace(/\.json$/, ".failures.json"), JSON.stringify(failures, null, 1));
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
