/**
 * Tell the DPReview watcher's seen-registry about reviews it never heard about.
 *
 * The registry is how the watcher decides what is new. Its cron routes keep it
 * current when they import a candidate themselves, but until the fix that
 * ships with this script the admin review queue did not: approving a watcher
 * submission created the entity and left the candidate at "pending" with a null
 * entity id, so the next weekly run read it as an unseen product and proposed
 * it again.
 *
 * This reconciles the rows already in that state. A candidate whose pending
 * edit was approved becomes "imported" and is pointed at the row it created;
 * one whose edit was rejected becomes "rejected". The entity is found by
 * DPReview URL, which the importer copies onto the row verbatim, so the match
 * is exact rather than a guess on the name — a candidate whose entity cannot be
 * found that way is reported and left alone.
 *
 * Usage (from frontend/):
 *   node scripts/sync-watcher-candidates.mjs           # dry run, prints the tally
 *   node scripts/sync-watcher-candidates.mjs --apply   # write it
 */

import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

const apply = process.argv.includes("--apply");
const sql = createSql();

/** Candidates still "pending" although a reviewer already answered their edit. */
const cameraRows = await sql`
  select d.id, d.name, d.dpreview_url, p.status as edit_status, c.id as entity_id
  from dpreview_camera_candidates d
  join pending_edits p on p.id = d.pending_edit_id
  left join cameras c on c.url = d.dpreview_url
  where d.status = 'pending' and p.status in ('approved', 'rejected')
  order by d.id`;

const lensRows = await sql`
  select d.id, d.name, d.dpreview_url, p.status as edit_status, l.id as entity_id
  from dpreview_lens_candidates d
  join pending_edits p on p.id = d.pending_edit_id
  left join lenses l on l.url = d.dpreview_url
  where d.status = 'pending' and p.status in ('approved', 'rejected')
  order by d.id`;

function split(rows, label) {
  const toImport = rows.filter((r) => r.edit_status === "approved" && r.entity_id);
  const toReject = rows.filter((r) => r.edit_status === "rejected");
  const unmatched = rows.filter((r) => r.edit_status === "approved" && !r.entity_id);
  console.log(`${label}: ${rows.length} candidate(s) still "pending" after review`);
  console.log(`  -> imported: ${toImport.length}   -> rejected: ${toReject.length}   unmatched: ${unmatched.length}`);
  for (const r of toImport.slice(0, 20)) console.log(`    #${r.id} ${r.name} -> ${label} ${r.entity_id}`);
  if (toImport.length > 20) console.log(`    ... and ${toImport.length - 20} more`);
  for (const r of unmatched) {
    console.log(`    #${r.id} ${r.name}: approved but no ${label} carries ${r.dpreview_url}`);
  }
  return { toImport, toReject, unmatched };
}

const cams = split(cameraRows, "camera");
const lens = split(lensRows, "lens");

const imported = cams.toImport.length + lens.toImport.length;
const rejected = cams.toReject.length + lens.toReject.length;
const unmatched = cams.unmatched.length + lens.unmatched.length;

if (!apply) {
  console.log(`\nDry run: would mark ${imported} imported and ${rejected} rejected.`);
  console.log("Re-run with --apply to write.");
  if (unmatched > 0) console.log(`${unmatched} would be left alone (no row carries their DPReview URL).`);
  process.exit(0);
}

for (const r of cams.toImport) {
  await sql`update dpreview_camera_candidates set status = 'imported', camera_id = ${r.entity_id} where id = ${r.id}`;
}
for (const r of cams.toReject) {
  await sql`update dpreview_camera_candidates set status = 'rejected' where id = ${r.id}`;
}
for (const r of lens.toImport) {
  await sql`update dpreview_lens_candidates set status = 'imported', lens_id = ${r.entity_id} where id = ${r.id}`;
}
for (const r of lens.toReject) {
  await sql`update dpreview_lens_candidates set status = 'rejected' where id = ${r.id}`;
}

console.log(`\nMarked ${imported} imported and ${rejected} rejected.`);
if (unmatched > 0) console.log(`${unmatched} left alone (no row carries their DPReview URL).`);
process.exit(0);
