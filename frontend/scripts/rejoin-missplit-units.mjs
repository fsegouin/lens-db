/**
 * Undo the word breaks the earlier whitespace pass put inside ordinary words.
 *
 * fix-description-whitespace.mjs restores a space after a unit, so that
 * "35mmlens" reads "35mm lens". Until today it searched every unit for the
 * longest one that prefixed the run, and a great many English words begin with
 * a unit: "standard" starts with the ordinal "st", "grams" with "g",
 * "performance" with "p", "degree" with "deg", "millimeters" with "m" and
 * "this" with "th". So "1.5/50standard" was written to the database as
 * "1.5/50st andard", and eleven other rows like it.
 *
 * src/lib/description-whitespace.ts no longer makes that split (only "mm",
 * "cm" and "x" may be peeled off a longer run, which is all the corpus ever
 * shows glued), but the damage is already stored, and it is the one kind the
 * repair pass cannot reverse: every other rule there only ever ADDS a space,
 * and this one has to take a space away.
 *
 * The judge is the corpus itself, as in scripts/lib/segment-glued.ts. A break
 * is undone only when the two halves spell a word that the other 10,000
 * descriptions use, and the right half on its own does not. That is what
 * separates "st|andard" (andard: never; standard: 979 times) from a real
 * measurement like "35mm| lens", where the right half is the commoner word.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/rejoin-missplit-units.mjs            # report
 *   node --env-file=.env.local scripts/rejoin-missplit-units.mjs --apply    # write
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";
import { buildVocabulary } from "./lib/segment-glued.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

const TABLES = [
  { table: "lenses", entity: "lens" },
  { table: "cameras", entity: "camera" },
];

/** Every unit the old longest-prefix search could have peeled off a word. */
const UNITS = [
  "inches", "inch", "deg", "fps", "sec", "min", "lbs",
  "mm", "cm", "nm", "um", "kg", "lb", "oz", "in", "ft", "ms", "hr",
  "th", "st", "nd", "rd", "mp", "ev", "bit",
  "m", "x", "g", "s", "p", "k", "f",
];

/** A word has to be this common in the corpus before it can undo a break. */
const MIN_FREQUENCY = 12;

const backupPath = args.includes("--backup")
  ? args[args.indexOf("--backup") + 1]
  : `${process.env.HOME}/Work/lens-db-missplit-before-${new Date().toISOString().slice(0, 10)}.jsonl`;
if (apply) writeFileSync(backupPath, "");

const sql = createSql();

try {
  const rows = [];
  for (const { table } of TABLES) {
    for (const r of await sql.unsafe(
      `SELECT id, slug, description FROM ${table}
       WHERE description IS NOT NULL AND description <> '' ORDER BY id`
    )) {
      rows.push({ ...r, table });
    }
  }
  const vocab = buildVocabulary(rows.map((r) => r.description));
  const freq = (w) => vocab.get(w.toLowerCase()) ?? 0;
  console.log(`dictionary: ${vocab.size} words counted from ${rows.length} descriptions\n`);

  // "…50st andard…" -> digit, the unit stuck to it, one space, the remainder.
  const BREAK = new RegExp(`([0-9])(${UNITS.join("|")}) ([a-z]{2,})\\b`, "g");

  const totals = { rows: 0, joins: 0, written: 0 };

  for (const { table, entity } of TABLES) {
    for (const row of rows.filter((r) => r.table === table)) {
      const joins = [];
      const next = row.description.replace(BREAK, (whole, digit, unit, rest) => {
        const joined = unit + rest;
        // The break is damage only when the two halves spell a word the corpus
        // uses and the right half alone does not. A genuine measurement fails
        // both tests: in "35mm lens" the right half is the commoner word.
        if (freq(joined) < MIN_FREQUENCY) return whole;
        if (freq(rest) >= MIN_FREQUENCY) return whole;
        joins.push(`${digit}${unit} ${rest}  ->  ${digit} ${joined}`);
        return `${digit} ${joined}`;
      });
      if (next === row.description) continue;

      // The only change permitted here is where the spaces fall. Anything else
      // is a bug in the pattern rather than a repair.
      const skeleton = (s) => s.replace(/\s+/g, "");
      if (skeleton(next) !== skeleton(row.description)) {
        throw new Error(`Rejoin altered non-whitespace characters in ${table}/${row.slug}`);
      }

      totals.rows += 1;
      totals.joins += joins.length;
      console.log(`${table}/${row.slug}`);
      for (const j of joins) console.log(`    ${j}`);

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
                          ${"Closed a word break left by an earlier whitespace repair"},
                          ${JSON.stringify(["description"])}::jsonb, true)`;
        totals.written += 1;
      }
    }
  }

  console.log(
    `\n${totals.rows} rows, ${totals.joins} breaks closed. ` +
      (apply ? `Wrote ${totals.written}, previous text in ${backupPath}.` : "Nothing written; pass --apply to write.")
  );
} finally {
  await sql.end();
}
