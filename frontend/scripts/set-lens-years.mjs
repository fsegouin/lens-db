/**
 * Apply verified release years from a JSON map (see
 * lens-years.verified.YYYY-MM-DD.json). Each entry is pinned by id AND name;
 * a mismatch aborts before any write. A `year: null` clears a bogus year.
 * Every change gets a patrolled revision whose summary carries the source.
 *
 * Usage (from frontend/):
 *   node scripts/set-lens-years.mjs scripts/lens-years.verified.2026-09-02.json          # dry run
 *   node scripts/set-lens-years.mjs scripts/lens-years.verified.2026-09-02.json --apply
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

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
if (!file) {
  console.error("usage: node scripts/set-lens-years.mjs <map.json> [--apply]");
  process.exit(1);
}
const { entries } = JSON.parse(readFileSync(resolve(file), "utf8"));

const sql = createSql();
try {
  const ids = entries.map((e) => e.id);
  const rows = await sql`select id, name, year_introduced from lenses where id = any(${ids}::int[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const problems = [];
  for (const e of entries) {
    const row = byId.get(e.id);
    if (!row) problems.push(`#${e.id} (${e.name}) not found`);
    else if (row.name !== e.name) problems.push(`#${e.id} is "${row.name}", expected "${e.name}"`);
    if (e.year != null && (!Number.isInteger(e.year) || e.year < 1900 || e.year > new Date().getUTCFullYear()))
      problems.push(`#${e.id} has an implausible year ${e.year}`);
  }
  if (problems.length) {
    console.error("Refusing to run — map does not match the database:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const changes = entries.filter((e) => byId.get(e.id).year_introduced !== e.year);
  const unchanged = entries.length - changes.length;
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${entries.length} entries, ${changes.length} changes, ${unchanged} already correct\n`);
  for (const e of changes) {
    const row = byId.get(e.id);
    console.log(`  #${e.id}  ${e.name}\n      ${row.year_introduced ?? "?"} → ${e.year ?? "unknown"}   ${e.source}${e.note ? `\n      note: ${e.note}` : ""}`);
  }

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to write.`);
  } else {
    for (const e of changes) {
      const row = byId.get(e.id);
      await sql`update lenses set year_introduced = ${e.year} where id = ${e.id}`;
      const [full] = await sql`select * from lenses where id = ${e.id}`;
      const snapshot = {};
      for (const [k, v] of Object.entries(full)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'lens' and entity_id = ${e.id}`;
      const summary = `Release year ${row.year_introduced ?? "unknown"} → ${e.year ?? "unknown"} (verified: ${e.source}${e.note ? `; ${e.note}` : ""})`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                values ('lens', ${e.id}, ${next}, ${JSON.stringify(snapshot)}::jsonb, ${summary}, ${JSON.stringify(["yearIntroduced"])}::jsonb, true)`;
    }
    console.log(`\nWrote ${changes.length} corrections with revisions.`);
  }
} finally {
  await sql.end();
}
