/**
 * The second half of the description repair: the runs that lost every space.
 *
 * scripts/fix-description-whitespace.mjs restores the spaces it can prove,
 * keying on a case or digit transition. Where the source wrapped every term in
 * its own tag there is no such transition left — "minimize <b>ghosting</b> and
 * <b>flare</b> while" collapsed to "minimizeghostingandflarewhile" — and only
 * the words themselves say where the boundaries were. See
 * scripts/lib/segment-glued.ts for how the dictionary is built and filtered.
 *
 * This one rewrites words rather than inserting spaces between characters that
 * are already correct, so it reports by default and writes only when asked.
 * Read the report before running --apply.
 *
 * Usage:
 *   node scripts/split-glued-descriptions.mjs                      # summary
 *   node scripts/split-glued-descriptions.mjs --report splits.txt  # every proposed split
 *   node scripts/split-glued-descriptions.mjs --apply              # write, with a revision per row
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";
import { buildVocabulary, isLikelyGerman, splitGluedRuns } from "./lib/segment-glued.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;

const TABLES = [
  { table: "lenses", entity: "lens" },
  { table: "cameras", entity: "camera" },
];

const backupPath =
  args.includes("--backup")
    ? args[args.indexOf("--backup") + 1]
    : `${process.env.HOME}/Work/lens-db-glued-before-${new Date().toISOString().slice(0, 10)}.jsonl`;
if (apply) writeFileSync(backupPath, "");

const sql = createSql();

try {
  const corpus = [];
  const byTable = new Map();
  for (const { table } of TABLES) {
    const rows = await sql.unsafe(
      `SELECT id, slug, description FROM ${table}
       WHERE description IS NOT NULL AND description <> '' ORDER BY id`
    );
    byTable.set(table, rows);
    for (const r of rows) corpus.push(r.description);
  }

  // The dictionary is counted from every description, including the ones about
  // to be repaired: the words in a glued run appear correctly spaced elsewhere.
  const vocab = buildVocabulary(corpus);
  console.log(`dictionary: ${vocab.size} words counted from ${corpus.length} descriptions\n`);

  const lines = [];
  const totals = { changed: 0, splits: 0, written: 0 };
  let skippedGerman = 0;

  for (const { table, entity } of TABLES) {
    let changedHere = 0;
    for (const row of byTable.get(table)) {
      // German compounds are correctly written as one word; see segment-glued.ts.
      if (isLikelyGerman(row.description)) {
        skippedGerman += 1;
        continue;
      }
      const { text, splits } = splitGluedRuns(row.description, vocab);
      if (text === row.description) continue;
      changedHere += 1;
      totals.changed += 1;
      totals.splits += splits.length;

      for (const pieces of splits) {
        // A one or two letter piece is where this is least certain, so mark it.
        const shaky = pieces.some((p) => p.length <= 2) ? " *" : "";
        lines.push(`${table}/${row.slug}\n    ${pieces.join("")}\n -> ${pieces.join(" ")}${shaky}`);
      }

      if (apply) {
        appendFileSync(
          backupPath,
          JSON.stringify({ table, id: row.id, slug: row.slug, description: row.description }) + "\n"
        );
        await sql.query(`UPDATE ${table} SET description = $1 WHERE id = $2`, [text, row.id]);
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
                          ${"Split words joined together when the description was imported"},
                          ${JSON.stringify(["description"])}::jsonb, true)`;
        totals.written += 1;
      }
    }
    console.log(`${table.padEnd(10)} ${String(changedHere).padStart(5)} rows would change`);
  }

  if (reportPath) {
    writeFileSync(reportPath, lines.join("\n\n") + "\n");
    console.log(`\nWrote ${lines.length} proposed splits to ${reportPath}`);
    console.log("Lines marked * contain a one or two letter piece and are the least certain.");
  }

  console.log(`\nSkipped ${skippedGerman} German-language rows, whose compounds are not damage.`);
  console.log(
    `\n${totals.changed} rows, ${totals.splits} runs. ` +
      (apply ? `Wrote ${totals.written}, previous text in ${backupPath}.` : "Nothing written; pass --apply to write.")
  );
} finally {
  await sql.end();
}
