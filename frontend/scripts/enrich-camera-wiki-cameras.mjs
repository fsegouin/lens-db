/**
 * Fill in the camera-wiki stubs from the articles they came from.
 *
 * The import wrote what camera-wiki's categories state — a year, a body type, a
 * mount — because categories are the only part of that site that is structured.
 * The articles themselves hold much more: the lens, the shutter, the focusing
 * method, the film format. Most of them write it as a labelled list, in one of
 * three house styles that have accumulated over the years:
 *
 *     * '''Lens:''' Agfa Apotar or Solinar, 105mm f/4.5
 *     * Introduced: 1940
 *     '''Dates:''' 1960
 *
 * so the fields can be read off directly. No model is asked to infer anything:
 * a value here is the source's own words with the wiki markup taken out, which
 * is what makes it citable. Prose is deliberately not imported — the free text
 * is CC BY-SA and copying it into descriptions would put the whole site under
 * share-alike, where quoting a specification does not.
 *
 * Specs land in the `specs` jsonb, and a year fills `year_introduced` only when
 * the row has none. Nothing already in the database is overwritten: a figure an
 * editor has touched outranks a scrape, and re-running must not undo their work.
 *
 * Usage (from frontend/):
 *   node scripts/enrich-camera-wiki-cameras.mjs                 # dry run
 *   node scripts/enrich-camera-wiki-cameras.mjs --limit 40      # sample
 *   node scripts/enrich-camera-wiki-cameras.mjs --apply
 */

import { createSql } from "./lib/db.mjs";

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; florent@segouin.me)";
/** The API accepts 50 titles per query, which is what makes this cheap. */
const BATCH = 50;

/**
 * Labels worth keeping, mapped to the spec key they are stored under. Anything
 * not named here is dropped: camera-wiki articles carry a long tail of one-off
 * labels ("Rangefinder base", "Cable release socket") that would turn the specs
 * panel into a junk drawer.
 */
const FIELDS = new Map([
  ["lens", "Lens"],
  ["lens/shutters", "Lens"],
  ["lenses", "Lens"],
  ["shutter", "Shutter"],
  ["shutter speeds", "Shutter speeds"],
  ["speeds", "Shutter speeds"],
  ["diaphragm", "Diaphragm"],
  ["aperture", "Diaphragm"],
  ["focusing", "Focusing"],
  ["focus", "Focusing"],
  ["viewfinder", "Viewfinder"],
  ["finder", "Viewfinder"],
  ["metering", "Metering"],
  ["meter", "Metering"],
  ["exposure meter", "Metering"],
  ["film", "Film"],
  ["film type", "Film"],
  ["film size", "Film"],
  ["format", "Format"],
  ["frame size", "Format"],
  ["picture size", "Format"],
  ["type", "Type"],
  ["camera type", "Type"],
  ["body", "Body"],
  ["weight", "Weight"],
  ["size", "Dimensions"],
  ["dimensions", "Dimensions"],
  ["flash", "Flash"],
  ["advance", "Film advance"],
  ["film advance", "Film advance"],
  ["manufacturer", "Manufacturer"],
  ["maker", "Manufacturer"],
  ["origin", "Origin"],
  ["country", "Origin"],
]);

/**
 * Labels that carry a date rather than a specification. `cameras` has a
 * year_introduced column but no discontinued one — that lives on `lenses` — so
 * the withdrawal year is kept as a spec rather than invented as a column.
 */
const YEAR_LABELS = new Set(["introduced", "dates", "date", "launched", "produced", "production", "years"]);
const END_LABELS = new Set(["withdrawn", "discontinued"]);

function parseArgs(argv) {
  const args = { apply: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

/**
 * Wiki markup to plain text: links keep their display text, bold and italics
 * go, templates and refs go, external links keep their label.
 */
function stripMarkup(value) {
  return value
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[(?:https?:)\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\[(?:https?:)\/\/\S+\]/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]$/, "");
}

/**
 * One labelled line, in any of the three house styles. The colon may sit inside
 * the bold markup or outside it, and the line may or may not be a list item.
 */
function parseLine(rawLine) {
  const line = rawLine.replace(/^[*:#]+\s*/, "").trim();
  if (!line) return null;

  const patterns = [
    /^'''([^']{2,30}?)\s*:\s*'''\s*(.+)$/, //  '''Lens:''' value
    /^'''([^']{2,30}?)'''\s*:\s*(.+)$/, //     '''Lens''': value
    /^([A-Za-z][\w /&-]{1,28}?)\s*:\s*(.+)$/, // Lens: value
  ];
  for (const pattern of patterns) {
    const m = line.match(pattern);
    if (!m) continue;
    const label = stripMarkup(m[1]).toLowerCase();
    const value = stripMarkup(m[2]);
    if (!label || !value || value.length > 300) continue;
    return { label, value };
  }
  return null;
}

/** The first plausible camera year in a string. */
function yearIn(value) {
  const m = value.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

function parseArticle(wikitext) {
  const specs = {};
  let year = null;
  let yearEnd = null;

  for (const line of wikitext.split("\n")) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { label, value } = parsed;

    if (YEAR_LABELS.has(label)) {
      year ??= yearIn(value);
      continue;
    }
    if (END_LABELS.has(label)) {
      yearEnd ??= yearIn(value);
      if (yearEnd && !specs.Discontinued) specs.Discontinued = String(yearEnd);
      continue;
    }
    const key = FIELDS.get(label);
    // First value wins: articles that describe several variants repeat a label,
    // and the first is the camera the page is about.
    if (key && !specs[key]) specs[key] = value;
  }
  return { specs, year, yearEnd };
}

function titleFromUrl(url) {
  const m = url.match(/camera-wiki\.org\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

async function fetchArticles(titles) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`camera-wiki ${res.status} ${res.statusText}`);
  const data = await res.json();

  const out = new Map();
  // Titles the wiki has normalised or redirected have to be mapped back, or the
  // article is fetched and then thrown away for not matching the row.
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
  for (const page of Object.values(data.query?.pages ?? {})) {
    const content = page.revisions?.[0]?.slots?.main?.["*"];
    if (!content) continue;
    out.set(alias.get(page.title) ?? page.title, content);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sql = createSql();

const rows = await sql.unsafe(`
  select id, name, url, year_introduced, specs
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
    console.error(`  batch at ${i} failed: ${err.message}`);
    continue;
  }

  for (const [title, row] of byTitle) {
    const wikitext = articles.get(title);
    if (!wikitext) {
      noArticle++;
      continue;
    }
    // The withdrawal year rides along inside specs; `cameras` has no column for
    // it, so parseArticle's yearEnd is not needed here.
    const { specs, year } = parseArticle(wikitext);

    // Never overwrite what is already there; only add what is missing.
    const existingSpecs = row.specs && typeof row.specs === "object" ? row.specs : {};
    const newSpecs = {};
    for (const [k, v] of Object.entries(specs)) {
      if (existingSpecs[k] === undefined) newSpecs[k] = v;
    }
    const setYear = row.year_introduced === null && year !== null ? year : null;

    if (!Object.keys(newSpecs).length && setYear === null) {
      nothingFound++;
      continue;
    }
    updates.push({ id: row.id, name: row.name, url: row.url, newSpecs, setYear });
  }

  process.stdout.write(`\r  fetched ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
process.stdout.write("\n");

const specKeyCounts = new Map();
for (const u of updates) {
  for (const k of Object.keys(u.newSpecs)) specKeyCounts.set(k, (specKeyCounts.get(k) ?? 0) + 1);
}

console.log(`\nArticles missing:        ${noArticle}`);
console.log(`Nothing new to add:      ${nothingFound}`);
console.log(`Rows to update:          ${updates.length}`);
console.log(`  gaining a year:        ${updates.filter((u) => u.setYear !== null).length}`);
console.log("\nSpec fields to be added:");
for (const [k, n] of [...specKeyCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log("\nFirst 6 updates:");
for (const u of updates.slice(0, 6)) {
  console.log(`  ${u.name}${u.setYear ? ` [year ${u.setYear}]` : ""}`);
  for (const [k, v] of Object.entries(u.newSpecs)) console.log(`      ${k}: ${v.slice(0, 90)}`);
}

if (!args.apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to update ${updates.length} cameras.`);
  await sql.end();
  process.exit(0);
}

let written = 0;
for (const u of updates) {
  await sql`
    UPDATE cameras
    SET specs = COALESCE(specs, '{}'::jsonb) || ${JSON.stringify(u.newSpecs)}::jsonb,
        year_introduced = COALESCE(year_introduced, ${u.setYear})
    WHERE id = ${u.id}
  `;
  written++;

  const fields = Object.keys(u.newSpecs).map((k) => `specs.${k}`);
  if (u.setYear !== null) fields.push("yearIntroduced");
  for (const field of fields) {
    await sql`
      INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
      VALUES ('camera', ${u.id}, ${field}, 'camera-wiki', ${u.url},
              'Read from the article''s own specification list. CC BY-SA.')
      ON CONFLICT (entity_type, entity_id, field) DO NOTHING
    `;
  }

  if (written % 100 === 0) process.stdout.write(`\r  written ${written}/${updates.length}`);
}
console.log(`\nUpdated ${written} cameras.`);
await sql.end();
