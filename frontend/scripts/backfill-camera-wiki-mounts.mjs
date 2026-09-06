/**
 * Give the camera-wiki cameras the mount they belong to.
 *
 * A camera on this site earns its place by the lenses that fit it, so a body
 * with no system is cut off from the thing the catalogue is for. The import left
 * 1,623 of them that way, because it only recognised a mount when camera-wiki's
 * category name matched one of ours exactly — and camera-wiki writes "42mm screw
 * mount" where we write "M42", "K mount" where we write "Pentax K".
 *
 * Two sources, in order of how much they can be trusted:
 *
 *   1. A mount category on the article. camera-wiki files bodies under
 *      "Nikon F mount", "Konica AR mount" and so on, and a category is a
 *      deliberate act by an editor.
 *   2. The prose, where it names a mount in so many words ("an M42 screw mount
 *      body"). Weaker, so it is only consulted when there is no category.
 *
 * Fixed-lens cameras are left alone, and that is the point rather than an
 * omission: a folding camera or a viewfinder compact has no mount, and giving
 * one a system would be a lie that shows up on the system's own page as a
 * camera that cannot take its lenses. Only bodies whose type implies
 * interchangeable lenses are considered, plus anything that names a mount
 * outright.
 *
 * Usage (from frontend/):
 *   node scripts/backfill-camera-wiki-mounts.mjs           # dry run
 *   node scripts/backfill-camera-wiki-mounts.mjs --apply
 */

import { createSql } from "./lib/db.mjs";

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; florent@segouin.me)";
/**
 * Categories are small, so fifty at a time is fine. Article text is not — asking
 * for fifty full articles moves megabytes and the server closes the connection
 * partway through, so the text pass uses a much smaller batch.
 */
const CATEGORY_BATCH = 50;
const CONTENT_BATCH = 12;

/**
 * A fetch that survives the wiki hanging up.
 *
 * This walks the whole catalogue in one run, so a single dropped socket would
 * otherwise throw away every mount found so far.
 */
async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`camera-wiki ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      // Back off, and give the server longer each time it hangs up.
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

const apply = process.argv.slice(2).includes("--apply");

/**
 * camera-wiki's name for a mount, mapped to ours. Only mounts the catalogue
 * already has a system for are listed; anything else is reported as unmapped
 * rather than guessed at, so a new mount shows up as a number to look at.
 */
const MOUNT_ALIASES = new Map([
  ["42mm screw mount", "M42"],
  ["39mm screw mount", "Leica Screw Mount (M39 / LTM)"],
  ["k mount", "Pentax K"],
  ["minolta af mount", "Minolta/Sony A"],
  ["minolta sr mount", "Minolta SR"],
  ["nikon f mount", "Nikon F"],
  ["nikon s mount", "Nikon S"],
  ["nikon z mount", "Nikon Z"],
  ["canon fd mount", "Canon FD"],
  ["canon fl mount", "Canon FL"],
  ["canon ef mount", "Canon EF"],
  ["canon ef-m mount", "Canon EF-M"],
  ["canon rf mount", "Canon RF"],
  ["leica m mount", "Leica M"],
  ["leica r mount", "Leica R"],
  ["l-mount", "Leica L"],
  ["konica ar mount", "Konica AR"],
  ["konica f mount", "Konica F"],
  ["contax/yashica mount", "Contax/Yashica"],
  ["contax rangefinder mount", "Contax Rangefinder"],
  ["olympus om mount", "Olympus OM"],
  ["fujica x mount", "Fujica X"],
  ["sony e-mount", "Sony E"],
  ["4/3 mount", "Four Thirds"],
  ["t mount", "T-mount (T2)"],
  ["mamiya cs mount", "Mamiya CS"],
  ["mamiya es mount", "Mamiya ES"],
  ["exakta mount", "Exakta"],
  ["praktica b mount", "Praktica B"],
  ["pentacon six mount", "Pentacon Six (Praktisix)"],
  ["m42 mount", "M42"],
]);

/**
 * How a mount is named in prose, for the articles that carry no category. Each
 * pattern has to be specific enough that it cannot fire on a passing mention of
 * the brand, which is why they all require the word "mount" or "thread" nearby.
 */
const PROSE_MOUNTS = [
  [/\b(?:M42|42\s*mm)\s+(?:screw\s+|thread\s+)?mount\b/i, "M42"],
  [/\bM42\s+(?:screw\s+)?thread\b/i, "M42"],
  [/\bPraktica\s+(?:screw\s+)?thread\b/i, "M42"],
  [/\b(?:M39|39\s*mm|Leica\s+screw|LTM)\s+(?:screw\s+|thread\s+)?mount\b/i, "Leica Screw Mount (M39 / LTM)"],
  [/\bLeica\s+M\s+(?:bayonet\s+)?mount\b/i, "Leica M"],
  [/\bLeica\s+R\s+mount\b/i, "Leica R"],
  [/\bNikon\s+F\s+(?:bayonet\s+)?mount\b/i, "Nikon F"],
  [/\bPentax\s+K\s+(?:bayonet\s+)?mount\b/i, "Pentax K"],
  [/\bK\s*-?\s*mount\b/i, "Pentax K"],
  [/\bCanon\s+FD\s+mount\b/i, "Canon FD"],
  [/\bCanon\s+FL\s+mount\b/i, "Canon FL"],
  [/\bCanon\s+EF\s+mount\b/i, "Canon EF"],
  [/\bMinolta\s+SR\s+mount\b/i, "Minolta SR"],
  [/\bMinolta\s+(?:AF|A)\s*-?\s*mount\b/i, "Minolta/Sony A"],
  [/\bOlympus\s+OM\s+mount\b/i, "Olympus OM"],
  [/\bKonica\s+AR\s+mount\b/i, "Konica AR"],
  [/\bExakta\s+(?:bayonet\s+)?mount\b/i, "Exakta"],
  [/\bContax\s*\/\s*Yashica\s+mount\b/i, "Contax/Yashica"],
  [/\bPentacon\s+Six\s+mount\b/i, "Pentacon Six (Praktisix)"],
  [/\bT\s*-?\s*mount\b/i, "T-mount (T2)"],
];

/**
 * Body types that take interchangeable lenses. A folding or viewfinder camera
 * is fixed-lens, and a rangefinder usually is too — the Canonet and the Yashica
 * Electro have no mount — so those are only given one if the article says so
 * outright, never inferred from the type.
 */
const INTERCHANGEABLE = new Set(["SLR", "Rangefinder", null]);

function titleFromUrl(url) {
  const m = url.match(/camera-wiki\.org\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

const sql = createSql();

const systems = await sql.unsafe("select id, name from systems");
const systemsByName = new Map(systems.map((s) => [s.name.toLowerCase(), s]));

const rows = await sql.unsafe(`
  select id, name, url, body_type from cameras
  where url like 'https://camera-wiki.org/wiki/%' and merged_into_id is null and system_id is null
  order by id
`);

console.log(`Cameras with no system: ${rows.length}`);

const byTitle = new Map();
for (const row of rows) {
  const title = titleFromUrl(row.url);
  if (title) byTitle.set(title, row);
}
const titles = [...byTitle.keys()];

const found = [];
const unmapped = new Map();

function record(row, systemName, via) {
  const system = systemsByName.get(systemName.toLowerCase());
  if (!system) {
    unmapped.set(`${systemName} (no such system here)`, (unmapped.get(systemName) ?? 0) + 1);
    return false;
  }
  found.push({ row, system, via });
  return true;
}

// Pass one: the categories, which are cheap and the better evidence.
const stillUnknown = [];
for (let i = 0; i < titles.length; i += CATEGORY_BATCH) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "categories");
  url.searchParams.set("cllimit", "max");
  url.searchParams.set("titles", titles.slice(i, i + CATEGORY_BATCH).join("|"));
  url.searchParams.set("format", "json");

  let data;
  try {
    data = await fetchWithRetry(url);
  } catch (error) {
    console.error(`\n  categories batch at ${i} gave up: ${error.message}`);
    continue;
  }
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);

  for (const page of Object.values(data.query?.pages ?? {})) {
    const title = alias.get(page.title) ?? page.title;
    const row = byTitle.get(title);
    if (!row) continue;

    const categories = (page.categories ?? []).map((c) => c.title.replace(/^Category:/, ""));
    const mountCategory = categories.find((c) => /\bmount\b/i.test(c) && !/^Lens mounts$/i.test(c));
    if (mountCategory) {
      const mapped = MOUNT_ALIASES.get(mountCategory.toLowerCase());
      if (mapped) {
        record(row, mapped, `category "${mountCategory}"`);
        continue;
      }
      unmapped.set(mountCategory, (unmapped.get(mountCategory) ?? 0) + 1);
    }
    // Only bodies that plausibly take lenses are worth reading in full.
    if (INTERCHANGEABLE.has(row.body_type)) stillUnknown.push({ title, row });
  }

  process.stdout.write(`\r  categories ${Math.min(i + CATEGORY_BATCH, titles.length)}/${titles.length}`);
}
process.stdout.write("\n");

// Pass two: the article text, for the ones a category did not settle.
console.log(`  reading ${stillUnknown.length} articles in full`);
for (let i = 0; i < stillUnknown.length; i += CONTENT_BATCH) {
  const slice = stillUnknown.slice(i, i + CONTENT_BATCH);
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("titles", slice.map((s) => s.title).join("|"));
  url.searchParams.set("format", "json");

  let data;
  try {
    data = await fetchWithRetry(url);
  } catch (error) {
    console.error(`\n  content batch at ${i} gave up: ${error.message}`);
    continue;
  }
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
  const rowsByTitle = new Map(slice.map((s) => [s.title, s.row]));

  for (const page of Object.values(data.query?.pages ?? {})) {
    const row = rowsByTitle.get(alias.get(page.title) ?? page.title);
    if (!row) continue;
    const content = page.revisions?.[0]?.slots?.main?.["*"] ?? "";
    for (const [pattern, name] of PROSE_MOUNTS) {
      if (pattern.test(content)) {
        record(row, name, "the article text");
        break;
      }
    }
  }

  process.stdout.write(`\r  articles ${Math.min(i + CONTENT_BATCH, stillUnknown.length)}/${stillUnknown.length}`);
}
process.stdout.write("\n");

const bySystem = new Map();
for (const f of found) bySystem.set(f.system.name, (bySystem.get(f.system.name) ?? 0) + 1);

console.log(`\nMounts found: ${found.length}`);
for (const [name, n] of [...bySystem].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}
if (unmapped.size) {
  console.log("\nMount categories with no system here (add them, or add the alias):");
  for (const [name, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${name}`);
  }
}
console.log("\nFirst 12:");
for (const f of found.slice(0, 12)) {
  console.log(`  ${f.row.name.padEnd(38)} -> ${f.system.name.padEnd(24)} from ${f.via}`);
}

if (!apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to set ${found.length} systems.`);
  await sql.end();
  process.exit(0);
}

let written = 0;
for (const f of found) {
  await sql`UPDATE cameras SET system_id = COALESCE(system_id, ${f.system.id}) WHERE id = ${f.row.id}`;
  await sql`
    INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
    VALUES ('camera', ${f.row.id}, 'systemId', 'camera-wiki', ${f.row.url},
            ${`Mount taken from ${f.via}. CC BY-SA.`})
    ON CONFLICT (entity_type, entity_id, field) DO NOTHING
  `;
  written++;
}
console.log(`\nSet the system on ${written} cameras.`);
await sql.end();
