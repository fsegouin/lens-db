/**
 * Apply the answers from judge-production-dates.mjs to lenses and cameras:
 * production_status, year_discontinued, and year_introduced where it was
 * empty. Dry run by default; --apply writes.
 *
 * What is written, and what is only reported:
 *   - An unknown product (s = "u") is never written.
 *   - An answer with a note (n) is the model's own doubt about which product
 *     the name means. Its status fills an empty status only (an old
 *     Rolleiflex lens is discontinued whichever generation it is), and its
 *     years are held: they belong to whichever product the model guessed.
 *   - "Discontinued" is written over an empty status or "In production".
 *   - "In production" is written over an empty status only. A stored
 *     "Discontinued" is never flipped back on the model's word: the model's
 *     knowledge stops before this year, and the stored value came from a
 *     manufacturer page. Those disagreements are listed.
 *   - "Collectible" and "Not yet in production" are left alone.
 *   - year_discontinued is filled where empty, from a discontinued answer
 *     with a plausible year (1839..this year, not before the introduction),
 *     and only when the model's announcement year equals the stored one.
 *     Measured 2026-09-07 on 6,178 lenses: the model's announcement year
 *     matched the stored one exactly 63% of the time and was more than five
 *     years off 5% of the time, so a discontinued year from the same memory
 *     is only trusted where the model has shown it knows this exact lens.
 *     The rest stay in the file as candidates. An existing value that
 *     disagrees is listed, not changed.
 *   - year_introduced is never filled by default (the same measurement, and
 *     the fix-lens-years.mjs lesson); the count is reported.
 *   - --all-years writes the unanchored discontinued years and the
 *     introduction-year fills too.
 *
 * Writes go in chunks of 200 rows, each chunk one transaction: one UPDATE
 * pinned by id AND name (so a stale file cannot hit a renamed row), one
 * re-select for the revision snapshots, one insert of patrolled revisions.
 * Before-values go to a JSONL backup first. Nothing is revalidated: the
 * pages pick the change up on their own ISR schedule, by design.
 *
 * Usage (from frontend/):
 *   node scripts/apply-production-dates.mjs --file scripts/production-dates.2026-09-07.jsonl
 *   node scripts/apply-production-dates.mjs --file ... --table lenses
 *   node scripts/apply-production-dates.mjs --file ... --apply
 *   node scripts/apply-production-dates.mjs --file ... --apply --backup ~/Work/production-dates.before.jsonl
 *   node scripts/apply-production-dates.mjs --file ... --apply --all-years
 *
 * Requires DATABASE_URL (in .env.local).
 */

import { createPool } from "./lib/db.mjs";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

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
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const APPLY = args.includes("--apply");
const ALL_YEARS = args.includes("--all-years");
const TABLE = argVal("--table", "all");
const FILE = argVal("--file", "");
const CHUNK = 200;
const today = new Date().toISOString().slice(0, 10);
const BACKUP = resolve(argVal("--backup", `${homedir()}/Work/production-dates.before.${today}.jsonl`));
const THIS_YEAR = new Date().getUTCFullYear();
const STATUS_LABEL = { c: "In production", d: "Discontinued" };

if (!FILE || !existsSync(FILE)) {
  console.error("--file <jsonl from judge-production-dates.mjs> is required");
  process.exit(1);
}

// Last answer per row wins, so a --force rerun of the judge supersedes.
const answers = new Map();
for (const line of readFileSync(FILE, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const j = JSON.parse(line);
  answers.set(`${j.table}:${j.id}`, j);
}
const modelName = [...answers.values()][0]?.model ?? "LLM";

const plausibleYear = (y) => Number.isInteger(y) && y >= 1839 && y <= THIS_YEAR;

// A review entry is { kind, text }: kind groups the tally, text is the line.
function decide(row, a) {
  const out = { id: row.id, name: row.name, set: {}, review: [], introDisagree: false, introKnown: false };
  const flag = (kind, text = kind) => out.review.push({ kind, text });
  if (!a) return flag("no answer"), out;
  if (a.s === "u") return flag("unknown to the model"), out;
  if (a.s === "c" && a.d != null) return flag("current with a discontinued year"), out;
  if (a.name !== row.name) return flag("renamed since the judge ran"), out;

  const cur = row.production_status;
  const proposed = STATUS_LABEL[a.s];
  if (a.n) {
    if (cur == null) out.set.production_status = proposed;
    flag("noted: status only", `note: ${a.n}`);
    return out;
  }
  if (cur == null) out.set.production_status = proposed;
  else if (cur === "In production" && proposed === "Discontinued") out.set.production_status = proposed;
  else if (cur === "Discontinued" && proposed === "In production") flag("stored Discontinued, model says current");

  if (a.s === "d" && plausibleYear(a.d)) {
    const intro = row.year_introduced ?? a.a;
    if (intro != null && a.d < intro) flag("discontinued before introduced", `discontinued ${a.d} before introduced ${intro}`);
    else if (row.year_discontinued != null) {
      if (row.year_discontinued !== a.d) flag("stored year_discontinued differs", `stored discontinued ${row.year_discontinued}, model says ${a.d}`);
    } else if (ALL_YEARS || a.a === row.year_introduced) out.set.year_discontinued = a.d;
    else flag("held: year_discontinued not anchored");
  }
  if (plausibleYear(a.a) && row.year_introduced != null) out.introKnown = true;

  if (plausibleYear(a.a)) {
    if (row.year_introduced == null) {
      if (ALL_YEARS) out.set.year_introduced = a.a;
      else flag("held: year_introduced from memory");
    } else if (row.year_introduced !== a.a) out.introDisagree = true;
  }
  return out;
}

const CAMEL_SKIP = new Set(["viewCount", "averageRating", "ratingCount", "submittedByIp"]);
function snapshot(row) {
  const s = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (!CAMEL_SKIP.has(camel)) s[camel] = v;
  }
  return s;
}
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function summaryFor(d, before) {
  const parts = [];
  if (d.set.production_status) parts.push(`Production status ${before.production_status ?? "unset"} → ${d.set.production_status}`);
  if (d.set.year_discontinued) parts.push(`year discontinued ${d.set.year_discontinued}`);
  if (d.set.year_introduced) parts.push(`year introduced ${d.set.year_introduced}`);
  return `${parts.join("; ")} (${modelName}, unaided, ${today})`;
}

async function writeChunk(client, table, entityType, decisions) {
  const ids = decisions.map((d) => d.id);
  await client.query("begin");
  try {
    const { rows: before } = await client.query(
      `select id, name, production_status, year_discontinued, year_introduced from ${table} where id = any($1::int[])`,
      [ids],
    );
    const beforeById = new Map(before.map((r) => [r.id, r]));
    appendFileSync(BACKUP, before.map((r) => JSON.stringify({ table, ...r })).join("\n") + "\n");

    // Full new values per row: the proposal where there is one, else the current.
    const values = [];
    const params = [];
    for (const d of decisions) {
      const b = beforeById.get(d.id);
      if (!b) throw new Error(`${table} #${d.id} vanished`);
      const ps = d.set.production_status ?? b.production_status;
      const yd = d.set.year_discontinued ?? b.year_discontinued;
      const yi = d.set.year_introduced ?? b.year_introduced;
      params.push(d.id, d.name, ps, yd, yi);
      const o = params.length - 5;
      values.push(`($${o + 1}::int, $${o + 2}::text, $${o + 3}::text, $${o + 4}::int, $${o + 5}::int)`);
    }
    const upd = await client.query(
      `update ${table} t set production_status = v.ps, year_discontinued = v.yd, year_introduced = v.yi
       from (values ${values.join(",")}) as v(id, name, ps, yd, yi)
       where t.id = v.id and t.name = v.name`,
      params,
    );
    if (upd.rowCount !== decisions.length) {
      throw new Error(`${table}: expected ${decisions.length} rows updated, got ${upd.rowCount} (a name no longer matches)`);
    }

    const { rows: after } = await client.query(`select * from ${table} where id = any($1::int[])`, [ids]);
    const afterById = new Map(after.map((r) => [r.id, r]));
    const { rows: nexts } = await client.query(
      `select entity_id, coalesce(max(revision_number), 0) + 1 as next from revisions
       where entity_type = $1 and entity_id = any($2::int[]) group by entity_id`,
      [entityType, ids],
    );
    const nextById = new Map(nexts.map((r) => [r.entity_id, Number(r.next)]));

    const rv = [];
    const rp = [];
    for (const d of decisions) {
      const b = beforeById.get(d.id);
      rp.push(
        entityType,
        d.id,
        nextById.get(d.id) ?? 1,
        JSON.stringify(snapshot(afterById.get(d.id))),
        summaryFor(d, b),
        JSON.stringify(Object.keys(d.set).map(camel)),
      );
      const o = rp.length - 6;
      rv.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}::jsonb, $${o + 5}, $${o + 6}::jsonb, true, now())`);
    }
    await client.query(
      `insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled, patrolled_at)
       values ${rv.join(",")}`,
      rp,
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

const pool = createPool();
try {
  const tables = TABLE === "all" ? ["lenses", "cameras"] : [TABLE];
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} from ${FILE} (${answers.size} answers)\n`);
  for (const table of tables) {
    const entityType = table === "lenses" ? "lens" : "camera";
    const { rows } = await pool.query(
      `select id, name, production_status, year_discontinued, year_introduced from ${table} where merged_into_id is null order by id`,
    );
    const decisions = rows.map((r) => decide(r, answers.get(`${table}:${r.id}`)));
    const writes = decisions.filter((d) => Object.keys(d.set).length);
    const reviews = decisions.filter((d) => d.review.length);

    const count = (pred) => decisions.filter(pred).length;
    const introKnown = count((d) => d.introKnown);
    console.log(`── ${table}: ${rows.length} live rows`);
    console.log(`   status → Discontinued: ${count((d) => d.set.production_status === "Discontinued")}`);
    console.log(`   status → In production: ${count((d) => d.set.production_status === "In production")}`);
    console.log(`   year_discontinued filled: ${count((d) => d.set.year_discontinued)}`);
    console.log(`   year_introduced filled: ${count((d) => d.set.year_introduced)}`);
    console.log(
      `   year_introduced disagreements where both known: ${count((d) => d.introDisagree)} of ${introKnown} (${introKnown ? Math.round((100 * count((d) => d.introDisagree)) / introKnown) : 0}%)`,
    );
    const reasons = {};
    for (const d of reviews) for (const r of d.review) reasons[r.kind] = (reasons[r.kind] ?? 0) + 1;
    console.log(`   review: ${reviews.length}  ${JSON.stringify(reasons)}`);
    const QUIET = new Set(["no answer", "unknown to the model", "held: year_discontinued not anchored", "held: year_introduced from memory"]);
    for (const d of reviews.filter((d) => d.review.some((r) => !QUIET.has(r.kind)))) {
      console.log(`     #${d.id} ${d.name}: ${d.review.map((r) => r.text).join("; ")}`);
    }
    console.log();

    if (!APPLY) continue;
    const client = await pool.connect();
    try {
      let n = 0;
      for (let i = 0; i < writes.length; i += CHUNK) {
        await writeChunk(client, table, entityType, writes.slice(i, i + CHUNK));
        n += Math.min(CHUNK, writes.length - i);
        process.stdout.write(`   wrote ${n}/${writes.length}\r`);
      }
      console.log(`   wrote ${n} ${table} rows with revisions; before-values in ${BACKUP}\n`);
    } finally {
      client.release();
    }
  }
  if (!APPLY) console.log("Dry run. Re-run with --apply to write.");
  else console.log("Not revalidated on purpose: pages refresh on their own ISR schedule.");
} finally {
  await pool.end();
}
