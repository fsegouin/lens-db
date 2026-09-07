/**
 * Reject the pending edits the DPReview spec audit filed under its old,
 * mistaken rules.
 *
 * The audit authors its own correction edits. Until the fix that ships with
 * this script it believed `lenses.aperture_max` held the stopped-down minimum
 * aperture ("F22"), which migration 0058 had already established it does not:
 * both aperture columns describe the lens wide open. It also passed text
 * suggestions through without the controlled vocabulary, so it proposed the
 * raw table's "Four Thirds" over a stored "micro-four-thirds" that already
 * means the same thing.
 *
 * Every such edit is a false alarm, and approving one would corrupt the row.
 * This rejects exactly those, leaving any genuine correction in the queue.
 *
 * Usage (from frontend/):
 *   node scripts/purge-stale-audit-edits.mjs           # dry run, prints the tally
 *   node scripts/purge-stale-audit-edits.mjs --apply   # reject them
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

/** Same normaliser the app uses; duplicated so this script needs no bundler. */
function normalizeCoverage(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  if (v.includes(",")) return null;
  if (v.includes("35mm") || v.includes("full frame") || v === "full-frame") return "full-frame";
  if (v.includes("aps-c") || v.includes("aps c")) return "aps-c";
  if (v.includes("four") && v.includes("third")) return "micro-four-thirds";
  if (v.includes("fourthirds")) return "micro-four-thirds";
  if (v.includes("medium format") || v === "medium-format") return "medium-format";
  if (v === "1" || v.includes("1-inch") || v.includes("1 inch") || v.includes('1"')) return "one-inch";
  return null;
}

/** The long-end wide-open aperture from the name, as migration 0058 read it. */
function parseApertureLongEnd(str) {
  if (!str) return null;
  const m = String(str).match(/(?:^|[\s(])[fF]\/?(\d+\.?\d*)(?:\s*-\s*(\d+\.?\d*))?/);
  if (!m) return null;
  return parseFloat(m[2] ?? m[1]);
}

const sql = createSql();

const rows = await sql`
  select p.id, p.entity_id, p.summary, p.changes, l.name, l.coverage, l.specs
  from pending_edits p
  join lenses l on l.id = p.entity_id
  where p.status = 'pending'
    and p.entity_type = 'lens'
    and p.summary like 'LLM spec audit:%'
  order by p.id`;

const stale = [];
const kept = [];

for (const row of rows) {
  const changes = row.changes ?? {};
  const specs = row.specs ?? {};
  const reasons = [];
  let realFields = 0;

  for (const [field, proposed] of Object.entries(changes)) {
    if (field === "_audit") continue;
    if (field === "apertureMax") {
      // The stopped-down limit restated into a wide-open column.
      // DPReview labels this row both ways across its templates.
      const raw = specs["Minimum aperture"] ?? specs["Min aperture"] ?? "";
      const stoppedDown = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(stoppedDown) && Number(proposed) === stoppedDown) {
        reasons.push(`apertureMax ${proposed} is the "Minimum aperture" row`);
        continue;
      }
      // Migration 0058 took this column from the name, which states the long
      // end wide open. A proposal the name contradicts is the stopped-down
      // value arriving by another route.
      const fromName = parseApertureLongEnd(row.name);
      if (fromName !== null && Math.abs(Number(proposed) - fromName) > 0.05) {
        reasons.push(`apertureMax ${proposed} contradicts the name (${fromName})`);
        continue;
      }
    }
    if (field === "coverage") {
      // A different spelling of the value already stored is not a correction.
      if (normalizeCoverage(proposed) === row.coverage) {
        reasons.push(`coverage "${proposed}" normalises to the stored ${row.coverage}`);
        continue;
      }
    }
    realFields += 1;
  }

  if (realFields === 0 && reasons.length > 0) stale.push({ ...row, reasons });
  else if (realFields > 0) kept.push(row);
}

console.log(`${rows.length} pending audit edits on lenses`);
console.log(`  stale (every proposed field is a false alarm): ${stale.length}`);
console.log(`  keep  (at least one real correction):          ${kept.length}\n`);

for (const s of stale.slice(0, 15)) {
  console.log(`  #${s.id} ${s.name}\n      ${s.reasons.join("; ")}`);
}
if (stale.length > 15) console.log(`  ... and ${stale.length - 15} more`);

if (process.argv.includes("--show-kept")) {
  console.log(`\nKEPT (a real correction to review):`);
  for (const k of kept) {
    const fields = Object.entries(k.changes ?? {})
      .filter(([f]) => f !== "_audit")
      .map(([f, v]) => `${f}=${v}`)
      .join(", ");
    console.log(`  #${k.id} ${k.name}: ${fields}`);
  }
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to reject them.");
  process.exit(0);
}

const ids = stale.map((s) => s.id);
if (ids.length === 0) {
  console.log("\nNothing to reject.");
  process.exit(0);
}
await sql`update pending_edits set status = 'rejected' where id = any(${ids}::int[])`;
console.log(`\nRejected ${ids.length} pending edits.`);
process.exit(0);
