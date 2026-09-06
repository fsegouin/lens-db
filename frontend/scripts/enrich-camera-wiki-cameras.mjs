/**
 * Fill in the camera-wiki stubs from the articles they came from.
 *
 * The import wrote what camera-wiki's categories state — a year, a body type, a
 * mount — because categories are the only structured part of that site. That
 * left pages saying little more than "Kodak DCS 200 is an SLR", against a
 * catalogue where the cameras inherited from lens-db.com carry a year, a mount,
 * a sensor and a description almost without exception.
 *
 * This closes that gap from two places in the same article:
 *
 *   - the labelled specification lists a minority of articles use
 *     ("* '''Lens:''' Agfa Apotar, 105mm f/4.5"), and
 *   - the prose the rest of them are written in, which carries the same facts
 *     in sentences ("released by Kodak, in 1992 ... a 1524 x 1012 pixel (1.5
 *     megapixel) sensor ... dimensions of 14x9.3 mm").
 *
 * Facts are taken, not sentences. Figures are not copyrightable where the
 * writing around them is, so nothing here reproduces camera-wiki's prose; the
 * description is composed from the extracted facts in this file's own words.
 * Every article still gets a citation, which is the CC BY-SA attribution.
 *
 * Where a fact belongs in a column it goes in the column — year, weight,
 * megapixels, sensor size, resolution, shutter type, mount — because that is
 * what the camera page renders. The rest lands in `specs`.
 *
 * Nothing already in the database is overwritten. A figure an editor has
 * touched outranks a scrape, and re-running must never undo their work.
 *
 * Usage (from frontend/):
 *   node scripts/enrich-camera-wiki-cameras.mjs                 # dry run
 *   node scripts/enrich-camera-wiki-cameras.mjs --limit 40      # sample
 *   node scripts/enrich-camera-wiki-cameras.mjs --apply
 */

import { createSql } from "./lib/db.mjs";
import {
  extractCountry,
  extractFilm,
  extractFormat,
  extractShutterType,
  extractLens,
  extractMount,
  extractSensor,
  extractShutter,
  extractWeight,
  extractYears,
  leadSection,
  toPlainText,
  composeDescription,
} from "./lib/camera-wiki-facts.mjs";

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; florent@segouin.me)";
/** The API accepts 50 titles per query, which is what makes this cheap. */
const BATCH = 50;

/**
 * Labelled fields worth keeping, mapped to the spec key they are stored under.
 * Anything not named here is dropped: articles carry a long tail of one-off
 * labels ("Cable release socket") that would turn the specs panel into a junk
 * drawer.
 */
const FIELDS = new Map([
  ["lens", "Lens"], ["lens/shutters", "Lens"], ["lenses", "Lens"],
  ["shutter", "Shutter"], ["shutter speeds", "Shutter speeds"], ["speeds", "Shutter speeds"],
  ["diaphragm", "Diaphragm"], ["aperture", "Diaphragm"],
  ["focusing", "Focusing"], ["focus", "Focusing"],
  ["viewfinder", "Viewfinder"], ["finder", "Viewfinder"],
  ["metering", "Metering"], ["meter", "Metering"], ["exposure meter", "Metering"],
  ["film", "Film"], ["film type", "Film"], ["film size", "Film"],
  ["format", "Format"], ["frame size", "Format"], ["picture size", "Format"],
  ["type", "Type"], ["camera type", "Type"],
  ["body", "Body"], ["weight", "Weight"],
  ["size", "Dimensions"], ["dimensions", "Dimensions"],
  ["flash", "Flash"], ["advance", "Film advance"], ["film advance", "Film advance"],
  ["manufacturer", "Manufacturer"], ["maker", "Manufacturer"],
  ["origin", "Origin"], ["country", "Origin"],
]);

const YEAR_LABELS = new Set(["introduced", "dates", "date", "launched", "produced", "production", "years"]);
const END_LABELS = new Set(["withdrawn", "discontinued"]);

function parseArgs(argv) {
  const args = { apply: false, limit: 0, redoDescriptions: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    // Only this script writes descriptions on camera-wiki rows, so rewriting
    // them is safe and is how a wording fix reaches the rows already done.
    else if (argv[i] === "--redo-descriptions") args.redoDescriptions = true;
  }
  return args;
}

/** One labelled line, in any of the three house styles the articles use. */
function parseLine(rawLine) {
  const line = rawLine.replace(/^[*:#]+\s*/, "").trim();
  if (!line) return null;
  const patterns = [
    /^'''([^']{2,30}?)\s*:\s*'''\s*(.+)$/,
    /^'''([^']{2,30}?)'''\s*:\s*(.+)$/,
    /^([A-Za-z][\w /&-]{1,28}?)\s*:\s*(.+)$/,
  ];
  for (const pattern of patterns) {
    const m = line.match(pattern);
    if (!m) continue;
    const label = toPlainText(m[1]).toLowerCase();
    const value = toPlainText(m[2]);
    if (!label || !value || value.length > 300) continue;
    return { label, value };
  }
  return null;
}

function yearIn(value) {
  const m = value.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

/** The labelled lists, where an article has them. */
function parseLabelled(wikitext) {
  const specs = {};
  let year = null;

  for (const line of wikitext.split("\n")) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { label, value } = parsed;

    if (YEAR_LABELS.has(label)) {
      year ??= yearIn(value);
      continue;
    }
    if (END_LABELS.has(label)) {
      const end = yearIn(value);
      if (end && !specs.Discontinued) specs.Discontinued = String(end);
      continue;
    }
    const key = FIELDS.get(label);
    if (key && !specs[key]) specs[key] = value;
  }
  return { specs, year };
}

function titleFromUrl(url) {
  const m = url.match(/camera-wiki\.org\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

async function fetchArticles(titles) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions|categories");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("cllimit", "max");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`camera-wiki ${res.status} ${res.statusText}`);
  const data = await res.json();

  const out = new Map();
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
  for (const page of Object.values(data.query?.pages ?? {})) {
    const content = page.revisions?.[0]?.slots?.main?.["*"];
    if (!content) continue;
    const categories = (page.categories ?? []).map((c) => c.title.replace(/^Category:/, ""));
    out.set(alias.get(page.title) ?? page.title, { content, categories });
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sql = createSql();

const systems = await sql.unsafe("select id, name from systems");
// Longest first, so "Nikon F" cannot claim a mention of "Nikon F mount" that a
// longer system name would have matched more precisely.
const systemNames = systems.map((s) => s.name).sort((a, b) => b.length - a.length);
const systemsByName = new Map(systems.map((s) => [s.name.toLowerCase(), s]));

const rows = await sql.unsafe(`
  select id, name, url, description, year_introduced, body_type, system_id,
         weight_g, shutter_type, sensor_size, megapixels, resolution, specs
  from cameras
  where url like 'https://camera-wiki.org/wiki/%' and merged_into_id is null
  order by id
  ${args.limit ? `limit ${Number(args.limit)}` : ""}
`);

console.log(`Cameras sourced from camera-wiki: ${rows.length}`);

const updates = [];
let noArticle = 0;
let nothingFound = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const byTitle = new Map();
  for (const row of batch) {
    const title = titleFromUrl(row.url);
    if (title) byTitle.set(title, row);
  }

  let articles;
  try {
    articles = await fetchArticles([...byTitle.keys()]);
  } catch (err) {
    console.error(`\n  batch at ${i} failed: ${err.message}`);
    continue;
  }

  for (const [title, row] of byTitle) {
    const article = articles.get(title);
    if (!article) {
      noArticle++;
      continue;
    }

    const { content, categories } = article;
    const lead = leadSection(content);
    const full = toPlainText(content);
    const labelled = parseLabelled(content);

    // Prose facts come from the lead, which is about this camera. The body of
    // an article wanders into variants and rivals.
    // The lead is about this camera, so it is tried first. Articles that open
    // with a photo table or a paragraph of company history state the date
    // further down, so the whole text is a fallback rather than the default.
    let years = extractYears(lead);
    if (years.start === null) {
      const wider = extractYears(full);
      if (wider.start !== null) years = wider;
      else if (years.decade === null && wider.decade !== null) years = wider;
    }
    const lens = extractLens(labelled.specs.Lens ?? lead);
    const sensor = extractSensor(lead);
    const shutter = extractShutter(labelled.specs.Shutter ?? labelled.specs["Shutter speeds"] ?? lead);
    const shutterType = extractShutterType(labelled.specs.Shutter ?? full);
    const format = extractFormat(categories);
    const weight = extractWeight(labelled.specs.Weight ?? "") ?? extractWeight(full);
    const mount = extractMount(full, systemNames);
    const film = extractFilm(categories);
    const country = extractCountry(categories);
    const maker = labelled.specs.Manufacturer ?? null;

    const specs = { ...labelled.specs };
    if (film && !specs.Film) specs.Film = film;
    if (country && !specs.Origin) specs.Origin = country;
    if (lens && !specs.Lens) specs.Lens = `${lens.focal}mm f/${lens.aperture}`;
    if (shutter && !specs.Shutter) specs.Shutter = `${shutter} sec`;
    // The catalogue's own key for the speed range, and the one the camera page
    // reads when the column is empty.
    if (shutter && !specs.Speeds) specs.Speeds = `${shutter} sec`;
    if (format && !specs["Maximum format"]) specs["Maximum format"] = format;
    // A decade cannot go in the integer column, but it is worth stating.
    if (years.decade && !specs.Introduced) specs.Introduced = years.decade;

    const existingSpecs = row.specs && typeof row.specs === "object" ? row.specs : {};
    const newSpecs = {};
    for (const [k, v] of Object.entries(specs)) {
      if (existingSpecs[k] === undefined) newSpecs[k] = v;
    }

    const set = {};
    if (row.year_introduced === null) {
      const year = labelled.year ?? years.start;
      if (year !== null) set.year_introduced = year;
    }
    if (row.weight_g === null && weight !== null) set.weight_g = weight;
    // shutter_type holds the mechanism ("Focal-plane"), which is what the
    // existing rows carry. An earlier pass put the speed range here; where that
    // happened the value is replaced, since a range was never the right answer.
    const shutterTypeIsSpeeds = row.shutter_type !== null && /^\s*1\//.test(row.shutter_type);
    if ((row.shutter_type === null || shutterTypeIsSpeeds) && shutterType !== null) {
      set.shutter_type = shutterType;
    } else if (shutterTypeIsSpeeds && shutterType === null) {
      set.shutter_type = null;
    }
    if (row.sensor_size === null && format !== null) set.sensor_size = format;
    if (row.megapixels === null && sensor?.megapixels) set.megapixels = sensor.megapixels;
    // A digital body's measured sensor beats the film-format label.
    if (sensor?.sensorSize && (row.sensor_size === null || set.sensor_size)) {
      set.sensor_size = sensor.sensorSize;
    }
    if (row.resolution === null && sensor?.resolution) set.resolution = sensor.resolution;
    if (row.system_id === null && mount) {
      const system = systemsByName.get(mount.toLowerCase());
      if (system) set.system_id = system.id;
    }

    if (row.description === null || args.redoDescriptions) {
      const description = composeDescription({
        name: row.name,
        maker,
        bodyType: row.body_type,
        film,
        country,
        years: { start: set.year_introduced ?? row.year_introduced, end: years.end },
        lens,
        sensor,
        shutter,
        weight: set.weight_g ?? row.weight_g,
      });
      if (description) set.description = description;
    }

    if (!Object.keys(newSpecs).length && !Object.keys(set).length) {
      nothingFound++;
      continue;
    }
    updates.push({ id: row.id, name: row.name, url: row.url, newSpecs, set });
  }

  process.stdout.write(`\r  fetched ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
process.stdout.write("\n");

const columnCounts = new Map();
const specCounts = new Map();
for (const u of updates) {
  for (const k of Object.keys(u.set)) columnCounts.set(k, (columnCounts.get(k) ?? 0) + 1);
  for (const k of Object.keys(u.newSpecs)) specCounts.set(k, (specCounts.get(k) ?? 0) + 1);
}

console.log(`\nArticles missing:   ${noArticle}`);
console.log(`Nothing new to add: ${nothingFound}`);
console.log(`Rows to update:     ${updates.length}`);
console.log("\nColumns to be filled:");
for (const [k, n] of [...columnCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log("\nSpec fields to be added:");
for (const [k, n] of [...specCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log("\nSample descriptions:");
for (const u of updates.filter((x) => x.set.description).slice(0, 6)) {
  console.log(`  ${u.set.description}`);
}

if (!args.apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to update ${updates.length} cameras.`);
  await sql.end();
  process.exit(0);
}

const COLUMNS = {
  description: "description",
  year_introduced: "year_introduced",
  weight_g: "weight_g",
  shutter_type: "shutter_type",
  megapixels: "megapixels",
  sensor_size: "sensor_size",
  resolution: "resolution",
  system_id: "system_id",
};
/** Column name to the schema field a citation is recorded against. */
const CITED_AS = {
  description: "description",
  year_introduced: "yearIntroduced",
  weight_g: "weightG",
  shutter_type: "shutterType",
  megapixels: "megapixels",
  sensor_size: "sensorSize",
  resolution: "resolution",
  system_id: "systemId",
};

let written = 0;
for (const u of updates) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(u.set)) {
    if (!COLUMNS[key]) continue;
    values.push(value);
    // COALESCE so a value written between the read and the write is not lost.
    sets.push(`${COLUMNS[key]} = COALESCE(${COLUMNS[key]}, $${values.length})`);
  }
  if (Object.keys(u.newSpecs).length) {
    values.push(JSON.stringify(u.newSpecs));
    sets.push(`specs = COALESCE(specs, '{}'::jsonb) || $${values.length}::jsonb`);
  }
  values.push(u.id);
  await sql.query(`UPDATE cameras SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  written++;

  const fields = [
    ...Object.keys(u.set).map((k) => CITED_AS[k]).filter(Boolean),
    ...Object.keys(u.newSpecs).map((k) => `specs.${k}`),
  ];
  for (const field of fields) {
    await sql`
      INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
      VALUES ('camera', ${u.id}, ${field}, 'camera-wiki', ${u.url},
              'Read from the camera-wiki article. CC BY-SA.')
      ON CONFLICT (entity_type, entity_id, field) DO NOTHING
    `;
  }

  if (written % 100 === 0) process.stdout.write(`\r  written ${written}/${updates.length}`);
}
console.log(`\nUpdated ${written} cameras.`);
await sql.end();
