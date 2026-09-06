/**
 * Site-wide repair of descriptions damaged by the lens-db.com import, which
 * deleted every space that sat on an inline-tag boundary. See
 * src/lib/description-whitespace.ts for the cause and the repair rules.
 *
 * Usage:
 *   node scripts/fix-description-whitespace.mjs                 # dry run summary
 *   node scripts/fix-description-whitespace.mjs --audit         # every distinct split, with counts
 *   node scripts/fix-description-whitespace.mjs --sample 40     # before/after for 40 rows
 *   node scripts/fix-description-whitespace.mjs --glued         # rows still glued, for a later pass
 *   node scripts/fix-description-whitespace.mjs --apply         # write, with a revision per row
 *   node scripts/fix-description-whitespace.mjs --apply --table lenses
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";
import { repairDescription, findGluedRuns, ZERO_WIDTH } from "../src/lib/description-whitespace.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const audit = args.includes("--audit");
const glued = args.includes("--glued");
const sampleSize = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) || 20 : 0;
const onlyTable = args.includes("--table") ? args[args.indexOf("--table") + 1] : null;

// entity_type is what the revisions table and the history pages expect.
//
// Collections are deliberately absent from the default set. Their descriptions
// are not prose that lost its spaces but whole HTML tables and navigation
// widgets flattened into one paragraph ("DateModel / EditionUnits1947Contax II
// Ivory..."), which need rewriting rather than respacing. Reach them with
// --table collections if that is genuinely what you want.
const TABLES = [
  { table: "lenses", entity: "lens" },
  { table: "cameras", entity: "camera" },
  { table: "systems", entity: "system" },
  { table: "lens_series", entity: null },
  { table: "tags", entity: null },
];
const EXTRA_TABLES = [{ table: "collections", entity: "collection" }];

// Revisions snapshot an entity AFTER it is updated, so they show the change in
// history but do not hold the text as it was. Every --apply run therefore dumps
// the previous descriptions first, giving a one-file undo.
const backupPath =
  args.includes("--backup")
    ? args[args.indexOf("--backup") + 1]
    : `${process.env.HOME}/Work/lens-db-descriptions-before-${new Date().toISOString().slice(0, 10)}.jsonl`;
if (apply) writeFileSync(backupPath, "");

const sql = createSql();

/** The words either side of each space this pass introduced. */
function splitsIntroduced(before, after) {
  const splits = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (after[j] === " ") {
      const left = (after.slice(0, j).match(/\S+$/) || [""])[0];
      const right = (after.slice(j + 1).match(/^\S+/) || [""])[0];
      splits.push(`${left} | ${right}`);
      j += 1;
      continue;
    }
    // Whitespace normalisation removed a character; skip it on the before side.
    i += 1;
  }
  return splits;
}

try {
  const totals = { scanned: 0, changed: 0, written: 0 };
  const splitCounts = new Map();
  const samples = [];
  const gluedRows = [];

  for (const { table, entity } of [...TABLES, ...EXTRA_TABLES]) {
    if (onlyTable ? table !== onlyTable : EXTRA_TABLES.some((t) => t.table === table)) continue;
    const rows = await sql.unsafe(
      `SELECT id, name, slug, description FROM ${table}
       WHERE description IS NOT NULL AND description <> '' ORDER BY id`
    );

    let changedHere = 0;
    for (const row of rows) {
      totals.scanned += 1;
      const before = row.description;
      const after = repairDescription(before);

      const runs = findGluedRuns(after);
      if (runs.length) gluedRows.push({ table, slug: row.slug, runs: runs.slice(0, 3) });

      if (after === before) continue;

      // The import only ever deleted whitespace, so a repair that alters any
      // non-whitespace character is a bug in the rules, not a fix. Checking it
      // per row bounds the worst case to "a space in the wrong place" and makes
      // silent data loss impossible.
      // Zero-width characters are removed by the repair and are not matched by
      // \s, so they are discarded on both sides before comparing.
      const skeleton = (s) => s.replace(ZERO_WIDTH, "").replace(/\s+/g, "");
      if (skeleton(after) !== skeleton(before)) {
        throw new Error(
          `Repair altered non-whitespace characters in ${table}/${row.slug}.\n` +
            `  before: ${before.slice(0, 200)}\n  after:  ${after.slice(0, 200)}`
        );
      }

      changedHere += 1;
      totals.changed += 1;

      for (const s of splitsIntroduced(before, after)) {
        splitCounts.set(s, (splitCounts.get(s) || 0) + 1);
      }
      if (samples.length < sampleSize) samples.push({ table, slug: row.slug, before, after });

      if (apply) {
        appendFileSync(
          backupPath,
          JSON.stringify({ table, id: row.id, slug: row.slug, description: before }) + "\n"
        );
        await sql.query(`UPDATE ${table} SET description = $1 WHERE id = $2`, [after, row.id]);
        if (entity) {
          // Patrolled revision mirroring lib/revisions.ts, so the edit shows in
          // history and can be reverted like any other.
          const [full] = await sql.query(`SELECT * FROM ${table} WHERE id = $1`, [row.id]);
          const snapshot = {};
          for (const [k, v] of Object.entries(full)) {
            const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) {
              snapshot[camel] = v;
            }
          }
          const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next
                                       from revisions
                                       where entity_type = ${entity} and entity_id = ${row.id}`;
          await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                    values (${entity}, ${row.id}, ${next}, ${JSON.stringify(snapshot)}::jsonb,
                            ${"Restored spaces lost when the description was imported"},
                            ${JSON.stringify(["description"])}::jsonb, true)`;
        }
        totals.written += 1;
      }
    }
    console.log(`${table.padEnd(12)} ${String(changedHere).padStart(5)} changed of ${rows.length}`);
  }

  if (audit) {
    console.log(`\n=== every distinct split introduced (${splitCounts.size}) ===`);
    for (const [s, n] of [...splitCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(String(n).padStart(5), s);
    }
  }

  if (sampleSize) {
    console.log("\n=== before / after ===");
    for (const s of samples) {
      console.log(`\n--- ${s.table}/${s.slug}`);
      console.log("  -", s.before.slice(0, 260));
      console.log("  +", s.after.slice(0, 260));
    }
  }

  if (glued) {
    console.log(`\n=== rows still holding fully glued runs (${gluedRows.length}) ===`);
    for (const g of gluedRows) console.log(`${g.table}/${g.slug}  ${g.runs.join(" ; ")}`);
  }

  console.log(
    `\nScanned ${totals.scanned}. ${totals.changed} need repair. ` +
      (apply
        ? `Wrote ${totals.written}.`
        : "Dry run; re-run with --apply to write.")
  );
} finally {
  await sql.end();
}
