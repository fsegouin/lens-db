/**
 * Write the list-item breaks that scripts/judge-runon-lists.mjs found.
 *
 * Reports by default, and the report is the point: read it before --apply.
 *
 * A break is inserted only at a phrase that occurs in the stored description
 * exactly once, and each row is checked afterwards: strip every whitespace
 * character from the new description and it must equal the old one stripped
 * the same way. So this pass can put a paragraph break in the wrong place and
 * can do nothing else — no rewording, no lost item, no altered product name.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/apply-runon-lists.mjs --in scripts/runon-lists.2026-09-08.jsonl
 *   node --env-file=.env.local scripts/apply-runon-lists.mjs --in <file> --apply
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

const ENTITY = { lenses: "lens", cameras: "camera" };

const backupPath = argVal(
  "--backup",
  `${process.env.HOME}/Work/lens-db-runon-before-${new Date().toISOString().slice(0, 10)}.jsonl`
);
if (apply) writeFileSync(backupPath, "");

const answers = [];
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const j = JSON.parse(line);
  if (j.starts?.length) answers.push(j);
}
console.log(`${answers.length} descriptions with list breaks, from ${IN}\n`);

const sql = createSql();

try {
  const totals = { rows: 0, breaks: 0, written: 0, skipped: 0 };

  for (const answer of answers) {
    const [row] = await sql.query(
      `SELECT id, slug, description FROM ${answer.table} WHERE id = $1`,
      [answer.id]
    );
    if (!row?.description) {
      totals.skipped += 1;
      continue;
    }

    // Locate each phrase afresh: the row may have been edited since it was
    // judged, and a phrase that is no longer unique is no longer usable.
    const positions = [];
    for (const phrase of answer.starts) {
      const first = row.description.indexOf(phrase);
      if (first === -1 || row.description.indexOf(phrase, first + 1) !== -1) continue;
      positions.push(first);
    }
    if (!positions.length) {
      totals.skipped += 1;
      continue;
    }
    positions.sort((a, b) => a - b);

    // Build the new text back to front so the earlier offsets stay valid.
    let next = row.description;
    for (const at of [...positions].reverse()) {
      const before = next.slice(0, at).replace(/\s+$/, "");
      next = `${before}\n\n${next.slice(at)}`;
    }

    // Whitespace only. Anything else is a bug in the answers, not a repair.
    const skeleton = (s) => s.replace(/\s+/g, "");
    if (skeleton(next) !== skeleton(row.description)) {
      throw new Error(`Break altered non-whitespace characters in ${answer.table}/${row.slug}`);
    }

    totals.rows += 1;
    totals.breaks += positions.length;
    console.log(`${answer.table}/${row.slug}  ${positions.length} items`);
    for (const phrase of answer.starts.slice(0, 3)) console.log(`    | ${phrase}`);

    if (apply) {
      appendFileSync(
        backupPath,
        JSON.stringify({ table: answer.table, id: row.id, slug: row.slug, description: row.description }) + "\n"
      );
      await sql.query(`UPDATE ${answer.table} SET description = $1 WHERE id = $2`, [next, row.id]);
      // A patrolled revision mirroring lib/revisions.ts, so the edit shows in
      // history and can be reverted like any other.
      const [full] = await sql.query(`SELECT * FROM ${answer.table} WHERE id = $1`, [row.id]);
      const snapshot = {};
      for (const [k, v] of Object.entries(full)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) {
          snapshot[camel] = v;
        }
      }
      const entity = ENTITY[answer.table];
      const [{ next: revision }] = await sql`select coalesce(max(revision_number), 0) + 1 as next
                                             from revisions
                                             where entity_type = ${entity} and entity_id = ${row.id}`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                values (${entity}, ${row.id}, ${revision}, ${JSON.stringify(snapshot)}::jsonb,
                        ${"Restored the line breaks of a feature list flattened by the import"},
                        ${JSON.stringify(["description"])}::jsonb, true)`;
      totals.written += 1;
    }
  }

  console.log(
    `\n${totals.rows} rows, ${totals.breaks} breaks` +
      (totals.skipped ? `, ${totals.skipped} skipped (edited since, or phrase no longer unique)` : "") +
      ". " +
      (apply ? `Wrote ${totals.written}, previous text in ${backupPath}.` : "Nothing written; pass --apply to write.")
  );
} finally {
  await sql.end();
}
