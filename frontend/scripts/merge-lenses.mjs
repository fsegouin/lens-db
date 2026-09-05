/**
 * Apply verified lens merges from a JSON map (see lens-merges.*.json).
 *
 * A merge is soft: the loser gets `merged_into_id` pointing at the keeper, and
 * /lenses/[slug] already follows that with a 308, so no URL dies. Nulling the
 * column undoes it. That is the same thing the admin duplicates queue does.
 *
 * Each entry is pinned by id AND name on both sides; any mismatch aborts
 * before a single write. Every merge records a patrolled revision carrying the
 * source that justified it, so the decision is auditable later.
 *
 * Usage (from frontend/):
 *   node scripts/merge-lenses.mjs scripts/lens-merges.2026-09-05.json          # dry run
 *   node scripts/merge-lenses.mjs scripts/lens-merges.2026-09-05.json --apply
 *   node scripts/merge-lenses.mjs scripts/lens-merges.2026-09-05.json --undo   # reverse them
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
const undo = args.includes("--undo");
if (!file) {
  console.error("usage: node scripts/merge-lenses.mjs <map.json> [--apply] [--undo]");
  process.exit(1);
}
const { entries } = JSON.parse(readFileSync(resolve(file), "utf8"));

const sql = createSql();
try {
  const ids = [...new Set(entries.flatMap((e) => [e.mergeId, e.keepId]))];
  const rows = await sql`select id, name, slug, merged_into_id from lenses where id = any(${ids}::int[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const problems = [];
  for (const e of entries) {
    for (const [idKey, nameKey] of [["mergeId", "mergeName"], ["keepId", "keepName"]]) {
      const row = byId.get(e[idKey]);
      if (!row) problems.push(`#${e[idKey]} (${e[nameKey]}) not found`);
      else if (row.name !== e[nameKey]) problems.push(`#${e[idKey]} is "${row.name}", expected "${e[nameKey]}"`);
    }
    if (e.mergeId === e.keepId) problems.push(`#${e.mergeId} merges into itself`);
    if (!e.source) problems.push(`#${e.mergeId} has no source`);
    // A keeper that is itself merged away would leave a redirect chain.
    const keeper = byId.get(e.keepId);
    if (keeper?.merged_into_id != null && keeper.merged_into_id !== e.mergeId) {
      problems.push(`keeper #${e.keepId} is itself merged into #${keeper.merged_into_id}`);
    }
  }
  if (problems.length) {
    console.error("Refusing to run — map does not match the database:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const changes = entries.filter((e) => {
    const current = byId.get(e.mergeId).merged_into_id;
    return undo ? current === e.keepId : current !== e.keepId;
  });

  console.log(
    `${apply ? "APPLY" : "DRY RUN"}${undo ? " (undo)" : ""} — ` +
      `${entries.length} entries, ${changes.length} to change, ${entries.length - changes.length} already in the target state\n`,
  );
  for (const e of changes) {
    console.log(
      undo
        ? `  un-merge #${e.mergeId}  ${e.mergeName}\n      was merged into #${e.keepId} ${e.keepName}`
        : `  merge #${e.mergeId}  ${e.mergeName}\n      into #${e.keepId}  ${e.keepName}\n      ${e.source}${e.note ? `\n      note: ${e.note}` : ""}`,
    );
  }

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to write.`);
  } else {
    for (const e of changes) {
      const newValue = undo ? null : e.keepId;
      await sql`update lenses set merged_into_id = ${newValue} where id = ${e.mergeId}`;

      const [full] = await sql`select * from lenses where id = ${e.mergeId}`;
      const snapshot = {};
      for (const [k, v] of Object.entries(full)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      const [{ next }] =
        await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'lens' and entity_id = ${e.mergeId}`;
      const summary = undo
        ? `Un-merged from "${e.keepName}" (#${e.keepId})`
        : `Merged into "${e.keepName}" (#${e.keepId}) as a duplicate (${e.source}${e.note ? `; ${e.note}` : ""})`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                values ('lens', ${e.mergeId}, ${next}, ${JSON.stringify(snapshot)}::jsonb, ${summary}, ${JSON.stringify(["mergedIntoId"])}::jsonb, true)`;
      console.log(`  ${undo ? "un-merged" : "merged"} #${e.mergeId}`);
    }
    console.log(`\nDone. ${changes.length} rows updated.`);
  }
} finally {
  await sql.end();
}
