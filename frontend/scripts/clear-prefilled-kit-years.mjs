/**
 * Clear the acquired year on kit items that the kit manager stamped by itself.
 *
 * Until 2026-09-06 the Year box in KitManager filled itself with the current
 * year on focus, and blur saved that value as if the owner had typed it. So
 * tabbing through a row recorded "bought 2026" on items nobody dated. Of the
 * 34 kit rows that existed when this ran, 21 said 2026 and every one of them
 * had a year; the site has no audit trail that can tell a typed 2026 from a
 * prefilled one, so this clears them all. Anyone who really bought something
 * this year types the year again, which is one field; leaving them meant
 * showing an invented purchase year on public profiles and owner lists.
 *
 * Before touching anything it writes every affected row to
 *   scripts/kit-acquired-year-cleared.<date>.json
 * so any single row can be restored by hand.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/clear-prefilled-kit-years.mjs           # dry run
 *   node --env-file=.env.local scripts/clear-prefilled-kit-years.mjs --apply
 *   node --env-file=.env.local scripts/clear-prefilled-kit-years.mjs --year 2027
 */
import { writeFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const yearIdx = args.indexOf("--year");
const year = yearIdx === -1 ? new Date().getFullYear() : parseInt(args[yearIdx + 1]);
if (!Number.isInteger(year)) throw new Error("--year needs an integer");

const sql = createSql();

const rows = await sql`
  SELECT k.id, k.user_id, u.handle, k.entity_type, k.entity_id, k.acquired_year,
         k.acquired_price, k.condition, k.created_at, k.updated_at
  FROM kit_items k JOIN users u ON u.id = k.user_id
  WHERE k.acquired_year = ${year}
  ORDER BY k.id`;

console.log(`${rows.length} kit rows say ${year}`);
for (const r of rows) {
  console.log(`  #${r.id} ${r.handle} ${r.entity_type} ${r.entity_id}`);
}

if (!apply) {
  console.log("dry run; pass --apply to clear them");
  process.exit(0);
}

if (rows.length > 0) {
  const stamp = new Date().toISOString().slice(0, 10);
  const out = new URL(`./kit-acquired-year-cleared.${stamp}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(rows, null, 2) + "\n");
  console.log(`before-values written to ${out.pathname}`);

  const ids = rows.map((r) => r.id);
  // updated_at is left alone: the owner did not edit anything.
  const cleared = await sql`
    UPDATE kit_items SET acquired_year = NULL
    WHERE id = ANY(${ids}) AND acquired_year = ${year}
    RETURNING id`;
  console.log(`cleared ${cleared.length} rows`);
}
process.exit(0);
