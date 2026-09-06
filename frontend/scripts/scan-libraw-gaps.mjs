/**
 * Compare LibRaw's supported-camera list against our `cameras` table and report
 * the digital bodies we are missing.
 *
 * LibRaw is the raw decoder behind darktable, RawTherapee and dcraw, so its list
 * is every camera that ever wrote a raw file — one plain-text file in the
 * upstream repo, no scraping, no key, no rate limit. That makes it the cheapest
 * completeness check available for the digital era, where our own catalogue grew
 * out of an archive of mostly film-era pages.
 *
 * It only covers raw shooters, so it says nothing about film bodies or JPEG-only
 * compacts. scan-camera-wiki-gaps.mjs covers the film side.
 *
 * Usage:
 *   node scripts/scan-libraw-gaps.mjs                 # summary to stdout
 *   node scripts/scan-libraw-gaps.mjs --json out.json # full candidate list
 *   node scripts/scan-libraw-gaps.mjs --all           # include out-of-scope makers
 */

import fs from "node:fs";
import { createSql } from "./lib/db.mjs";
import { buildIndex, lookup } from "./lib/catalogue-match.mjs";
import { classifyDigitalBody, DROPPED_BY_DEFAULT } from "./lib/body-class.mjs";

const SOURCE_URL =
  "https://raw.githubusercontent.com/LibRaw/LibRaw/master/src/tables/cameralist.cpp";

/**
 * Makers whose LibRaw entries are not the kind of camera this site catalogues.
 * Phones and drones shoot raw but have no interchangeable lens and no mount, so
 * they would arrive as thousands of rows that no lens page can ever link to.
 * Digital backs (Leaf, Phase One, Sinar, Imacon) are a genuine judgement call
 * rather than noise: they mount on catalogued bodies, so they are reported
 * separately instead of being silently dropped.
 */
const OUT_OF_SCOPE_MAKERS = new Set([
  "apple", "huawei", "xiaomi", "google", "nokia", "oneplus", "lg", "htc",
  "motorola", "asus", "blackberry", "sony ericsson", "zte", "vivo", "oppo",
  "dji", "gopro", "parrot", "yuneec", "autelrobotics", "skydio",
  "omnivision", "avt", "jaipulnix", "smal", "raspberrypi", "gitup",
  "blackmagic", "kinefinity", "ikonoskop", "digital bolex", "red",
]);

const DIGITAL_BACK_MAKERS = new Set(["leaf", "phaseone", "sinar", "imacon", "seitz"]);

/** LibRaw writes some makers as one word; our catalogue spaces them out. */
const MAKER_DISPLAY = new Map([
  ["fujifilm", "Fujifilm"],
  ["phaseone", "Phase One"],
  ["autelrobotics", "Autel Robotics"],
  ["raspberrypi", "Raspberry Pi"],
  ["blackmagic", "Blackmagic"],
  ["jaipulnix", "Jai Pulnix"],
  ["om", "OM System"],
]);

function parseArgs(argv) {
  const args = { json: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") args.json = argv[++i] ?? "libraw-gaps.json";
    else if (argv[i] === "--all") args.all = true;
  }
  return args;
}

async function fetchCameraList() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com)" },
  });
  if (!res.ok) throw new Error(`LibRaw fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * The file is a C array of quoted model strings. Taking only the first quoted
 * run on a line skips the surrounding declaration and any trailing comment.
 */
function parseModels(source) {
  const models = [];
  for (const line of source.split("\n")) {
    const m = line.match(/^\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) continue;
    const model = m[1].replace(/\\"/g, '"').trim();
    if (model.length > 3) models.push(model);
  }
  return models;
}

function makerKeyOf(model) {
  return model.split(/\s+/)[0].toLowerCase();
}

function displayMaker(key) {
  return MAKER_DISPLAY.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const args = parseArgs(process.argv.slice(2));
const sql = createSql();

const models = parseModels(await fetchCameraList());
if (models.length < 500) {
  throw new Error(`Parsed only ${models.length} models from LibRaw; the file format likely changed`);
}

const cameras = await sql.unsafe(
  "select id, name, slug, year_introduced from cameras where merged_into_id is null",
);
const index = buildIndex(cameras);

const present = [];
const missing = [];
const backs = [];
const skipped = [];
/** Candidates we do not have but do not want, kept for the tally. */
const dropped = new Map();

for (const model of models) {
  const makerKey = makerKeyOf(model);
  const entry = { model, maker: displayMaker(makerKey) };

  if (OUT_OF_SCOPE_MAKERS.has(makerKey)) {
    skipped.push(entry);
    continue;
  }
  const hit = lookup(index, model);
  if (hit) {
    present.push({ ...entry, matched: hit[0].name });
    continue;
  }
  if (DIGITAL_BACK_MAKERS.has(makerKey)) {
    backs.push(entry);
    continue;
  }

  // Classify only what we are missing: a body already in the catalogue stays
  // there regardless of what class it falls into. This is a scanner, not a
  // culling tool.
  const bodyClass = classifyDigitalBody(model);
  if (!args.all && DROPPED_BY_DEFAULT.has(bodyClass)) {
    if (!dropped.has(bodyClass)) dropped.set(bodyClass, []);
    dropped.get(bodyClass).push(entry);
    continue;
  }
  missing.push({ ...entry, class: bodyClass });
}

const byMaker = new Map();
for (const entry of missing) {
  byMaker.set(entry.maker, (byMaker.get(entry.maker) ?? 0) + 1);
}
const ranked = [...byMaker.entries()].sort((a, b) => b[1] - a[1]);

console.log(`LibRaw models parsed:     ${models.length}`);
console.log(`Already in our catalogue: ${present.length}`);
console.log(`Out of scope (phones etc): ${skipped.length}`);
console.log(`Digital backs (review):   ${backs.length}`);
console.log(`Missing cameras:          ${missing.length}`);
for (const [bodyClass, entries] of [...dropped].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  dropped as ${bodyClass}:`.padEnd(26) + String(entries.length).padStart(4));
}
const notable = missing.filter((m) => m.class === "notable-compact");
if (notable.length) {
  console.log(`\nNotable fixed-lens compacts kept (${notable.length}):`);
  console.log(`  ${notable.map((m) => m.model).join(", ")}`);
}
console.log("\nMissing by maker:");
for (const [maker, count] of ranked) {
  console.log(`  ${String(count).padStart(4)}  ${maker}`);
}

if (args.json) {
  const payload = {
    source: SOURCE_URL,
    scanned_at: new Date().toISOString(),
    counts: {
      parsed: models.length,
      present: present.length,
      missing: missing.length,
      digital_backs: backs.length,
      out_of_scope: skipped.length,
      dropped: Object.fromEntries([...dropped].map(([k, v]) => [k, v.length])),
    },
    missing,
    digital_backs: backs,
    ...(args.all ? { out_of_scope: skipped, dropped: Object.fromEntries(dropped) } : {}),
  };
  fs.writeFileSync(args.json, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${args.json}`);
}

await sql.end();
