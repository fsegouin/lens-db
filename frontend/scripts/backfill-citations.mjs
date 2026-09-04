/**
 * Backfill the citations we can already prove, and nothing more.
 *
 * Two honest claims exist in the corpus today:
 *
 *  - A field a person edited here did not come from the scrape. The revision
 *    that last changed it carries the date and the editor's summary, so the
 *    field can be traced to a specific act by a specific account.
 *  - A mount matched to Wikidata was checked against that item's own
 *    description, not merely name-matched, so the identifier is sourced.
 *
 * Everything else keeps falling back to the entity's import url, which is the
 * truth: nobody has checked it since. Inventing citations for those would
 * defeat the purpose of having them.
 *
 * Idempotent: citeField upserts on (entity_type, entity_id, field).
 *
 *   node --experimental-strip-types scripts/backfill-citations.mjs [--apply]
 */
import { readFileSync } from "fs";
import pg from "../node_modules/pg/lib/index.js";

const root = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(`${root}.env.local`, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const ca = readFileSync(`${root}src/db/supabase-ca.ts`, "utf8")
  .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)[0];
const u = new URL(env.DATABASE_URL);
const pool = new pg.Pool({
  host: u.hostname, port: +u.port || 6543, user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password), database: u.pathname.slice(1), max: 1,
  ssl: { ca, rejectUnauthorized: true },
});

const APPLY = process.argv.includes("--apply");

// The most recent revision that touched each field is the one that explains
// its current value; earlier ones have been superseded.
const { rows: edits } = await pool.query(`
  select distinct on (r.entity_type, r.entity_id, f)
         r.entity_type, r.entity_id, f as field, r.id as revision_id,
         r.created_at, r.summary, coalesce(u.display_name, u.handle) as username
  from revisions r
  cross join lateral jsonb_array_elements_text(r.changed_fields) f
  left join users u on u.id = r.user_id
  order by r.entity_type, r.entity_id, f, r.created_at desc
`);

const { rows: mounts } = await pool.query(
  `select id, name, wikidata_qid from systems where wikidata_qid is not null`);

console.log(`field edits to cite:      ${edits.length}`);
console.log(`wikidata mounts to cite:  ${mounts.length}`);
console.log(`total:                    ${edits.length + mounts.length}`);

if (!APPLY) {
  console.log("\ndry run. Sample:");
  for (const e of edits.slice(0, 5)) {
    console.log(`  ${e.entity_type} ${e.entity_id} .${e.field}  <- revision ${e.revision_id} by ${e.username ?? "anonymous"} (${String(e.created_at).slice(0, 10)})`);
  }
  for (const m of mounts.slice(0, 3)) {
    console.log(`  system ${m.id} .wikidataQid  <- ${m.wikidata_qid} (${m.name})`);
  }
  console.log("\nre-run with --apply to write.");
  await pool.end();
  process.exit(0);
}

const upsert = `
  insert into field_citations
    (entity_type, entity_id, field, source_name, source_url, retrieved_at, revision_id, note)
  values ($1,$2,$3,$4,$5,$6,$7,$8)
  on conflict (entity_type, entity_id, field) do update set
    source_name = excluded.source_name,
    source_url  = excluded.source_url,
    retrieved_at= excluded.retrieved_at,
    revision_id = excluded.revision_id,
    note        = excluded.note`;

let n = 0;
for (const e of edits) {
  await pool.query(upsert, [
    e.entity_type, e.entity_id, e.field,
    // Not dressed up as a source: it says a person changed it here, and the
    // revision is where that claim can be checked.
    e.username ? `Community edit by ${e.username}` : "Community edit",
    `/history/${e.entity_type}/${e.entity_id}`,
    e.created_at, e.revision_id, e.summary ?? null,
  ]);
  n++;
}
for (const m of mounts) {
  await pool.query(upsert, [
    "system", m.id, "wikidataQid", "Wikidata",
    `https://www.wikidata.org/wiki/${m.wikidata_qid}`,
    new Date(), null,
    "Matched on an exact name and an item description naming it a mount.",
  ]);
  n++;
}
console.log(`wrote ${n} citations`);
await pool.end();
