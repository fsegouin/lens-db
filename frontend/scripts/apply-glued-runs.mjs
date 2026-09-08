/**
 * Write the word breaks that scripts/judge-glued-runs.mjs found.
 *
 * Reports by default, and the report is the point: read it before --apply.
 *
 * The safety property carries through from the judge. A run is replaced only
 * by the same letters with spaces added, and each row is checked again after
 * the substitutions: strip every space from the new description and it must
 * equal the old one stripped the same way. So this pass can put a space in the
 * wrong place, and cannot do anything else — no rewording, no lost sentence,
 * no corrupted product name.
 *
 * Runs are replaced longest-first, since the shorter ones are substrings of the
 * longer: "of distortion" would otherwise fire inside "of distortion and" and
 * leave the tail unsplit.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/apply-glued-runs.mjs --in scripts/glued-runs.2026-09-08.jsonl
 *   node --env-file=.env.local scripts/apply-glued-runs.mjs --in <file> --apply
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const apply = args.includes("--apply");
const IN = argVal("--in", null);
if (!IN) {
  console.error("--in <judge output.jsonl> is required");
  process.exit(1);
}

const TABLES = [
  { table: "lenses", entity: "lens" },
  { table: "cameras", entity: "camera" },
];

const backupPath = argVal(
  "--backup",
  `${process.env.HOME}/Work/lens-db-glued-runs-before-${new Date().toISOString().slice(0, 10)}.jsonl`
);
if (apply) writeFileSync(backupPath, "");

// The judge's answers, keeping only the runs it actually split. A rejected
// answer (one whose letters did not match) carries no pieces and is skipped.
const splits = [];
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const j = JSON.parse(line);
  if (!j.pieces || j.pieces.length < 2) continue;
  splits.push({ run: j.run, replacement: j.pieces.join(" ") });
}
splits.sort((a, b) => b.run.length - a.run.length);
console.log(`${splits.length} runs to split, from ${IN}\n`);

const sql = createSql();

try {
  const totals = { rows: 0, replacements: 0, written: 0 };
  const used = new Map();

  for (const { table, entity } of TABLES) {
    const rows = await sql.unsafe(
      `SELECT id, slug, description FROM ${table}
       WHERE description IS NOT NULL AND description <> '' ORDER BY id`
    );
    let changedHere = 0;

    for (const row of rows) {
      let next = row.description;
      const applied = [];
      for (const { run, replacement } of splits) {
        if (!next.includes(run)) continue;
        const n = next.split(run).length - 1;
        next = next.split(run).join(replacement);
        applied.push(`${run}  ->  ${replacement}`);
        used.set(run, (used.get(run) ?? 0) + n);
        totals.replacements += n;
      }
      if (!applied.length) continue;

      // Letters only. Anything else is a bug in the answers, not a repair.
      const skeleton = (s) => s.replace(/\s+/g, "");
      if (skeleton(next) !== skeleton(row.description)) {
        throw new Error(`Split altered non-whitespace characters in ${table}/${row.slug}`);
      }

      changedHere += 1;
      totals.rows += 1;
      console.log(`${table}/${row.slug}`);
      for (const a of applied) console.log(`    ${a}`);

      if (apply) {
        appendFileSync(
          backupPath,
          JSON.stringify({ table, id: row.id, slug: row.slug, description: row.description }) + "\n"
        );
        await sql.query(`UPDATE ${table} SET description = $1 WHERE id = $2`, [next, row.id]);
        // A patrolled revision mirroring lib/revisions.ts, so the edit shows in
        // history and can be reverted like any other.
        const [full] = await sql.query(`SELECT * FROM ${table} WHERE id = $1`, [row.id]);
        const snapshot = {};
        for (const [k, v] of Object.entries(full)) {
          const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) {
            snapshot[camel] = v;
          }
        }
        const [{ next: revision }] = await sql`select coalesce(max(revision_number), 0) + 1 as next
                                               from revisions
                                               where entity_type = ${entity} and entity_id = ${row.id}`;
        await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                  values (${entity}, ${row.id}, ${revision}, ${JSON.stringify(snapshot)}::jsonb,
                          ${"Split words joined together when the description was imported"},
                          ${JSON.stringify(["description"])}::jsonb, true)`;
        totals.written += 1;
      }
    }
    console.log(`\n${table}: ${changedHere} rows\n`);
  }

  const unused = splits.filter((s) => !used.has(s.run));
  if (unused.length) console.log(`${unused.length} runs matched nothing (already repaired, or overlapped a longer run)`);

  console.log(
    `\n${totals.rows} rows, ${totals.replacements} runs split. ` +
      (apply ? `Wrote ${totals.written}, previous text in ${backupPath}.` : "Nothing written; pass --apply to write.")
  );
} finally {
  await sql.end();
}
