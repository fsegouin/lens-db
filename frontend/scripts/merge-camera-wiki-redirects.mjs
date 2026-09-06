/**
 * Merge the camera-wiki rows that are really the same camera under another name.
 *
 * camera-wiki keeps a page for every name a camera was sold under and redirects
 * the alternates at the real article: "Ikomat A" is what Zeiss Ikon called the
 * Ikonta 520 in the US, "Instax Mini 50s" redirects to the Mini 50. The import
 * asked the API for pages by title and got the redirect's content back without
 * being told it had followed one, so both names became rows.
 *
 * The fix is a merge, not a delete. `cameras.merged_into_id` already exists for
 * this and the detail page follows it, so the alternate name keeps working as a
 * URL and lands on the surviving camera — which is what someone searching for an
 * Ikomat should get. Deleting the row would turn that into a 404 and throw away
 * the fact that the two names are the same camera.
 *
 * Only rows whose redirect target is itself in the catalogue are merged. A
 * redirect page whose target we do not have is left alone: it is the only record
 * of that camera here, and merging it into nothing would lose it.
 *
 * Usage (from frontend/):
 *   node scripts/merge-camera-wiki-redirects.mjs           # dry run
 *   node scripts/merge-camera-wiki-redirects.mjs --apply
 */

import { createSql } from "./lib/db.mjs";

const API = "https://camera-wiki.org/api.php";
const USER_AGENT = "thelensdb-catalogue-scan/1.0 (+https://thelensdb.com; florent@segouin.me)";
const BATCH = 50;

const apply = process.argv.slice(2).includes("--apply");

function titleFromUrl(url) {
  const m = url.match(/camera-wiki\.org\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

const sql = createSql();

const rows = await sql.unsafe(`
  select id, name, url from cameras
  where url like 'https://camera-wiki.org/wiki/%' and merged_into_id is null
  order by id
`);

const byTitle = new Map();
for (const row of rows) {
  const title = titleFromUrl(row.url);
  if (title) byTitle.set(title, row);
}

const titles = [...byTitle.keys()];
const merges = [];

for (let i = 0; i < titles.length; i += BATCH) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", titles.slice(i, i + BATCH).join("|"));
  // Asking the API to resolve redirects is what makes them visible: without
  // this it silently serves the target's content under the requested title,
  // which is exactly how these rows were created.
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.error(`  batch at ${i} failed: ${res.status}`);
    continue;
  }
  const data = await res.json();

  for (const redirect of data.query?.redirects ?? []) {
    const source = byTitle.get(redirect.from);
    const target = byTitle.get(redirect.to);
    if (!source || !target || source.id === target.id) continue;
    merges.push({ source, target });
  }
  process.stdout.write(`\r  checked ${Math.min(i + BATCH, titles.length)}/${titles.length}`);
}
process.stdout.write("\n");

console.log(`\ncamera-wiki rows:        ${rows.length}`);
console.log(`Redirects to merge away: ${merges.length}`);
console.log("\nFirst 20:");
for (const m of merges.slice(0, 20)) {
  console.log(`  ${m.source.name.padEnd(42)} -> ${m.target.name}`);
}

if (!apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to merge ${merges.length} cameras.`);
  await sql.end();
  process.exit(0);
}

let merged = 0;
for (const m of merges) {
  // Guard against chaining a merge into a row that is itself merged away, which
  // would leave the detail page redirecting to a redirect.
  const [target] = await sql`SELECT merged_into_id FROM cameras WHERE id = ${m.target.id}`;
  if (!target || target.merged_into_id !== null) continue;

  await sql`UPDATE cameras SET merged_into_id = ${m.target.id} WHERE id = ${m.source.id}`;
  merged++;
}

console.log(`\nMerged ${merged} cameras.`);
await sql.end();
