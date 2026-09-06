/**
 * Compare camera-wiki.org's brand categories against our `cameras` table and
 * report the bodies we are missing.
 *
 * Our catalogue grew out of an archive of lens-db.com, which was organised
 * around interchangeable-lens systems, so it is strong on Japanese SLRs and
 * rangefinders and thin on everything else: 16 Kodak bodies against the several
 * hundred Kodak made, and two Agfa. camera-wiki is the opposite shape — a
 * volunteer encyclopedia of some ten thousand articles, weighted to exactly the
 * film-era Western and consumer cameras we lack — which is what makes it worth
 * scanning rather than a second source for cameras we already have.
 *
 * It is a MediaWiki, so this reads the ordinary api.php rather than scraping,
 * and the content is CC BY-SA: anything imported from here needs attribution.
 *
 * A brand category holds more than cameras (film stocks, flashes, meters, the
 * brand's own article), so each page's own categories decide whether it is a
 * camera. A page carrying a format or body-type category ("Japanese 35mm SLR",
 * "German 6x9 viewfinder folding") is one; a page carrying "Film" or
 * "Electronic flash" is not. Pages that match neither are reported as
 * unclassified rather than guessed at, because a scanner that quietly counts
 * light meters as missing cameras is worse than one that admits what it cannot
 * tell.
 *
 * Usage:
 *   node scripts/scan-camera-wiki-gaps.mjs                    # default brand list
 *   node scripts/scan-camera-wiki-gaps.mjs --brand Kodak --brand Agfa
 *   node scripts/scan-camera-wiki-gaps.mjs --json out.json
 */

import fs from "node:fs";
import { createSql } from "./lib/db.mjs";
import { buildIndex, lookup } from "./lib/catalogue-match.mjs";
import { classifyWikiBody, DROPPED_BY_DEFAULT } from "./lib/body-class.mjs";

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; florent@segouin.me)";

/**
 * Brands worth scanning, as camera-wiki spells its categories. The default list
 * leads with the ones our own counts show we are thinnest on.
 */
const DEFAULT_BRANDS = [
  "Kodak", "Agfa", "Polaroid", "Zeiss Ikon", "Voigtländer", "Minolta",
  "Olympus", "Yashica", "Canon", "Nikon", "Pentax", "Konica", "Ricoh",
  "Fuji", "Mamiya", "Rollei", "Contax", "Leica", "Praktica", "Exakta",
  "Ihagee", "Balda", "Certo", "Franka", "Dacora", "Braun", "Bilora",
  "Ansco", "Argus", "Graflex", "Kowa", "Topcon",
  "Miranda", "Chinon", "Cosina", "Bronica", "Zenit", "Zorki",
  // camera-wiki files by the maker, which is not always the marque a
  // photographer would name: the Kiev bodies sit under their Ukrainian maker
  // Arsenal, and LOMO is capitalised. A brand whose category does not exist
  // reports zero and is warned about rather than passing as full coverage.
  "Arsenal", "LOMO", "KMZ", "Ferrania", "Wirgin", "Beier",
];

/**
 * A page in a brand category is a camera if one of its own categories names a
 * body type or a film format. camera-wiki files bodies under compound names
 * like "Japanese 35mm SLR" and "German 6x9 viewfinder folding", so matching a
 * distinctive word anywhere in the category name is enough.
 */
const CAMERA_SIGNAL =
  /\b(slr|tlr|rangefinder|viewfinder|folding|box|compact|instant|subminiature|stereo|panoramic|press|view|field|monorail|scale focus|half.?frame|disc|aps|toy|pinhole|reflex|point.?and.?shoot)\b/i;

const FORMAT_SIGNAL =
  /\b(\d{3} film|35mm|4x5|5x7|8x10|6x6|6x9|6x7|6x4\.5|9x12|6\.5x9|plate|sheet film|roll film|digital)\b/i;

/**
 * Categories that mark a page as something other than a camera: film stocks,
 * flashes, meters, and the makers' own articles.
 *
 * These are only consulted when nothing above said "camera", because the two
 * sets overlap on words that mean different things in different categories.
 * "120 film" is the format a camera takes while "Film" is a page about film
 * stock, and a category as plain as "Stub" says how finished an article is, not
 * what it describes — testing exclusions first threw out most of the catalogue,
 * including every folding camera filed under "120 film".
 */
const NOT_A_CAMERA =
  /\b(makers?|manufacturers?|distributors?|lenses|meters?|flash(es)?|accessor\w*|tripods?|enlargers?|projectors?|filters?|shutters?|films?|paper|chemical\w*|books?|magazines?|people|photographers?|museums?|shops?)\b/i;

function parseArgs(argv) {
  const args = { brands: [], json: null, limit: 0, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--brand") args.brands.push(argv[++i]);
    else if (argv[i] === "--json") args.json = argv[++i] ?? "camera-wiki-gaps.json";
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--all") args.all = true;
  }
  if (!args.brands.length) args.brands = DEFAULT_BRANDS;
  if (args.limit > 0) args.brands = args.brands.slice(0, args.limit);
  return args;
}

async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: "json" })) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`camera-wiki ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/**
 * Every page in a brand category, with the categories each page belongs to.
 *
 * MediaWiki caps how much it returns per request and continues in two
 * independent dimensions here — the next batch of pages, and the next batch of
 * categories for pages already seen. Both arrive in the same `continue` object,
 * so the loop feeds it back verbatim and merges categories into whatever it has
 * for that title. Dropping the continuation would return pages with an empty
 * category list, which classify() cannot tell apart from a genuine accessory.
 */
async function fetchCategoryPages(brand) {
  const pages = new Map();
  let cont = {};

  for (let guard = 0; guard < 50; guard++) {
    const data = await api({
      action: "query",
      generator: "categorymembers",
      gcmtitle: `Category:${brand}`,
      gcmlimit: 500,
      gcmtype: "page",
      prop: "categories",
      cllimit: "max",
      ...cont,
    });

    for (const page of Object.values(data?.query?.pages ?? {})) {
      const existing = pages.get(page.title) ?? new Set();
      for (const c of page.categories ?? []) existing.add(c.title.replace(/^Category:/, ""));
      pages.set(page.title, existing);
    }

    if (!data.continue) break;
    cont = data.continue;
  }

  return pages;
}

/**
 * Titles that describe a range rather than a body — "Nikon L series", "Nikon
 * rangefinder cameras". They carry the same format categories as the models
 * they cover, so only the title distinguishes them, and importing one would
 * create a camera that was never sold.
 */
const OVERVIEW_TITLE = /\b(series|cameras|models|range|lineup|list)$/i;

/**
 * The facts camera-wiki files a camera under, pulled out of its categories.
 *
 * The articles themselves are free prose with no infobox, so the categories are
 * the only structured data on the site — but they carry more than the body type
 * the classifier needs. A bare four-digit category is the year of introduction,
 * a category ending in "mount" names the lens mount, and the compound type
 * category ("Japanese 35mm SLR") holds the nationality and film format. That is
 * enough to hand over a reviewable record rather than a bare name.
 */
function extractFacts(categories) {
  const facts = { year: null, mount: null, format: null, type: null };
  for (const category of categories) {
    const year = category.match(/^(1[89]\d{2}|20[0-2]\d)$/);
    if (year) {
      // A camera can carry more than one year category; the earliest is the
      // introduction, the later ones are revisions.
      const value = Number(year[1]);
      if (facts.year === null || value < facts.year) facts.year = value;
      continue;
    }
    const mount = category.match(/^(.*?) mount$/i);
    if (mount) {
      facts.mount = mount[1].trim();
      continue;
    }
    if (CAMERA_SIGNAL.test(category) || FORMAT_SIGNAL.test(category)) {
      // Keep the most specific type category: "Japanese 35mm SLR" says more
      // than "35mm", and the longer string is reliably the more specific one.
      if (!facts.type || category.length > facts.type.length) facts.type = category;
      const format = category.match(/\b(\d{3} film|35mm|\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:in)?)\b/i);
      if (format && !facts.format) facts.format = format[1];
    }
  }
  return facts;
}

function classify(categories) {
  const list = [...categories];
  // A body-type or format category is strong positive evidence and wins: a
  // flash is never filed under "Japanese 35mm SLR", so nothing is lost by
  // trusting it, while testing the exclusions first loses real cameras.
  if (list.some((c) => CAMERA_SIGNAL.test(c) || FORMAT_SIGNAL.test(c))) return "camera";
  if (list.some((c) => NOT_A_CAMERA.test(c))) return "not-a-camera";
  return "unclassified";
}

/**
 * camera-wiki titles a body the way collectors say it, which often omits the
 * maker ("Ambi Silette", not "Agfa Ambi Silette"), while our names lead with the
 * brand. Offering both spellings lets the matcher meet whichever we store.
 */
function candidateNames(title, brand, otherBrands) {
  const names = [title];
  const lower = title.toLowerCase();
  if (lower.includes(brand.toLowerCase())) return names;
  // camera-wiki cross-files a body under every maker involved, so the Kodak DCS
  // bodies built on Nikon chassis sit in Category:Nikon. Prefixing the category
  // brand onto a title that already names a different maker would ask the
  // matcher for a "Nikon Kodak DCS 100", so leave those titles alone.
  if (otherBrands.some((b) => lower.startsWith(b))) return names;
  return [...names, `${brand} ${title}`];
}

const args = parseArgs(process.argv.slice(2));
const sql = createSql();

/** Lowercased brand names used to spot a title that names a different maker. */
const knownBrands = args.brands.map((b) => b.toLowerCase());

const cameras = await sql.unsafe(
  "select id, name, slug from cameras where merged_into_id is null",
);
const index = buildIndex(cameras);

// camera-wiki writes a mount as "Nikon F mount"; our systems table calls the
// same thing "Nikon F". Matching them means an imported body can arrive already
// attached to the system its lenses hang off, which is the whole point of
// having it on this site.
const systems = await sql.unsafe("select id, name from systems");
const systemsByName = new Map(systems.map((s) => [s.name.toLowerCase(), s]));

const missing = [];
const unclassified = [];
let cameraPages = 0;
let present = 0;
let excluded = 0;
let overviews = 0;
const emptyCategories = [];
const dropped = new Map();
const notable = [];
let withYear = 0;
let withSystem = 0;

console.log(`Scanning ${args.brands.length} brand categories on camera-wiki.org\n`);
console.log("brand                 wiki  have  missing");

for (const brand of args.brands) {
  const otherBrands = knownBrands.filter((b) => b !== brand.toLowerCase());
  let pages;
  try {
    pages = await fetchCategoryPages(brand);
  } catch (err) {
    console.log(`${brand.padEnd(20)}  (failed: ${err.message})`);
    continue;
  }

  if (!pages.size) {
    console.log(`${brand.padEnd(20)}      -     -        -   (no such category — check the spelling)`);
    emptyCategories.push(brand);
    continue;
  }

  let brandCameras = 0;
  let brandPresent = 0;
  let brandMissing = 0;

  for (const [title, categories] of pages) {
    // The category contains the maker's own article; it is not a camera.
    if (title.toLowerCase() === brand.toLowerCase()) continue;
    if (OVERVIEW_TITLE.test(title)) {
      overviews++;
      continue;
    }
    const kind = classify(categories);
    if (kind === "not-a-camera") {
      excluded++;
      continue;
    }
    if (kind === "unclassified") {
      unclassified.push({ brand, title });
      continue;
    }

    brandCameras++;
    cameraPages++;
    const names = candidateNames(title, brand, otherBrands);
    if (names.some((n) => lookup(index, n))) {
      present++;
      brandPresent++;
    } else {
      // Only what we are missing gets judged on whether we want it; a body
      // already catalogued stays regardless of class.
      const bodyClass = classifyWikiBody(title, categories);
      if (!args.all && DROPPED_BY_DEFAULT.has(bodyClass)) {
        dropped.set(bodyClass, (dropped.get(bodyClass) ?? 0) + 1);
        continue;
      }
      if (bodyClass === "notable-compact") notable.push(`${brand}: ${title}`);
      const facts = extractFacts(categories);
      const system = facts.mount ? systemsByName.get(facts.mount.toLowerCase()) : undefined;
      if (facts.year) withYear++;
      if (system) withSystem++;
      missing.push({
        brand,
        title,
        class: bodyClass,
        year: facts.year,
        type: facts.type,
        format: facts.format,
        mount: facts.mount,
        system_id: system?.id ?? null,
        system: system?.name ?? null,
        url: `https://camera-wiki.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      });
      brandMissing++;
    }
  }

  console.log(
    `${brand.padEnd(20)} ${String(brandCameras).padStart(5)} ${String(brandPresent).padStart(5)} ${String(brandMissing).padStart(8)}`,
  );
}

/**
 * One article, one camera.
 *
 * camera-wiki files a body under every maker involved in it, so the Kodak DCS
 * bodies appear in both Category:Kodak and Category:Nikon, and the Agfa-Ansco
 * cameras in both of theirs — 62 articles reached here twice. Left alone that
 * imports each of them as two cameras with near-identical slugs. Where a title
 * names one of its makers, that maker's copy is the one kept, so the Kodak DCS
 * 100 is filed under Kodak rather than under Nikon.
 */
const deduped = new Map();
for (const candidate of missing) {
  const existing = deduped.get(candidate.title);
  if (!existing) {
    deduped.set(candidate.title, candidate);
    continue;
  }
  const names = (c) => c.title.toLowerCase().includes(c.brand.toLowerCase());
  if (!names(existing) && names(candidate)) deduped.set(candidate.title, candidate);
}
const duplicatePages = missing.length - deduped.size;
missing.length = 0;
missing.push(...deduped.values());

console.log(`\nCamera pages classified:  ${cameraPages}`);
console.log(`Already in our catalogue: ${present}`);
console.log(`Missing cameras:          ${missing.length}`);
console.log(`Cross-filed duplicates:   ${duplicatePages}`);
console.log(`Non-camera pages skipped: ${excluded}`);
console.log(`Overview pages skipped:   ${overviews}`);
console.log(`Unclassified (review):    ${unclassified.length}`);
for (const [bodyClass, n] of [...dropped].sort((a, b) => b[1] - a[1])) {
  console.log(`  dropped as ${bodyClass}:`.padEnd(28) + String(n).padStart(5));
}
const byClass = new Map();
for (const m of missing) byClass.set(m.class, (byClass.get(m.class) ?? 0) + 1);
console.log("\nKept by class:");
for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log(`\nOf the ${missing.length} kept: ${withYear} carry a year, ${withSystem} match a system we already have.`);
if (notable.length) {
  console.log(`\nPremium 80s/90s film compacts kept (${notable.length}):`);
  console.log(`  ${notable.join(", ")}`);
}
if (emptyCategories.length) {
  console.log(`\nNo such category on camera-wiki: ${emptyCategories.join(", ")}`);
}

if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      {
        source: "https://camera-wiki.org (CC BY-SA)",
        scanned_at: new Date().toISOString(),
        brands: args.brands,
        counts: {
          camera_pages: cameraPages,
          present,
          missing: missing.length,
          excluded,
          overviews,
          unclassified: unclassified.length,
          dropped: Object.fromEntries(dropped),
        },
        missing,
        unclassified,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${args.json}`);
}

await sql.end();
