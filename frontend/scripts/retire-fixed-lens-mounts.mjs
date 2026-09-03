/**
 * Take the mount away from the bodies that never had one.
 *
 * Run after scripts/backfill-built-in-lenses.mjs. A camera with a
 * built_in_lens_id has a lens that does not come off, so it has no lens mount,
 * yet 26 of them still claimed a system because that was the only way to
 * record them before migration 0038. They claimed it in two ways:
 *
 *   1. A one-camera "system" invented to hold the family. "Fujifilm GA645
 *      Professional", "Fujica GS645 Professional" and "Plaubel Makina 67" are
 *      systems with no lenses and no members but their own fixed-lens bodies.
 *   2. The mount of an interchangeable sibling. The Leica I (Model A) predates
 *      the screw mount, which arrived with the Model C, and its lens is not
 *      removable; the Hasselblad SWC shares the V system's film back but takes
 *      no V lens. Both were filed under a mount that will not accept them, so
 *      their pages offered visitors lenses that cannot be fitted.
 *
 * Systems left with no cameras and no lenses are deleted. There is no
 * surviving mount to redirect their slugs to, so those three URLs 404 rather
 * than resolve to an empty page.
 *
 * Usage (from frontend/):
 *   node scripts/retire-fixed-lens-mounts.mjs            # dry run
 *   node scripts/retire-fixed-lens-mounts.mjs --apply    # write
 */

import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

if (!process.env.DATABASE_URL) {
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
}

const apply = process.argv.slice(2).includes("--apply");
const sql = createSql();

const claiming = await sql`
  SELECT c.id, c.name, c.system_id, s.name AS system_name, s.slug AS system_slug
  FROM cameras c
  JOIN systems s ON s.id = c.system_id
  WHERE c.built_in_lens_id IS NOT NULL
  ORDER BY s.name, c.name`;

console.log(`${claiming.length} fixed-lens cameras still claim a mount:\n`);
const bySystem = new Map();
for (const row of claiming) {
  if (!bySystem.has(row.system_name)) bySystem.set(row.system_name, []);
  bySystem.get(row.system_name).push(row);
}
for (const [system, rows] of bySystem) {
  console.log(`  ${system}`);
  for (const row of rows) console.log(`      #${row.id} ${row.name}`);
}

// A system is only emptied by this change if nothing else lives in it.
const orphaned = await sql`
  SELECT s.id, s.name, s.slug,
    (SELECT count(*)::int FROM lens_systems ls WHERE ls.system_id = s.id) AS lenses,
    (SELECT count(*)::int FROM cameras c
      WHERE c.system_id = s.id AND c.built_in_lens_id IS NULL) AS other_cameras
  FROM systems s
  WHERE s.id IN (SELECT system_id FROM cameras WHERE built_in_lens_id IS NOT NULL)
  ORDER BY s.name`;

const toDelete = orphaned.filter((s) => s.lenses === 0 && s.other_cameras === 0);
const toKeep = orphaned.filter((s) => s.lenses > 0 || s.other_cameras > 0);

console.log(`\nSystems left empty and deleted (${toDelete.length}):`);
for (const s of toDelete) console.log(`  ${s.name}  (/systems/${s.slug} will 404)`);

console.log(`\nSystems kept, they hold other cameras or lenses (${toKeep.length}):`);
for (const s of toKeep) {
  console.log(`  ${s.name}  lenses=${s.lenses} other cameras=${s.other_cameras}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  await sql.end();
  process.exit(0);
}

await sql.unsafe("BEGIN");
try {
  await sql`UPDATE cameras SET system_id = NULL WHERE built_in_lens_id IS NOT NULL`;
  for (const s of toDelete) {
    await sql`DELETE FROM systems WHERE id = ${s.id}`;
  }
  await sql.unsafe("COMMIT");
} catch (error) {
  await sql.unsafe("ROLLBACK");
  throw error;
}

console.log(`\nApplied: ${claiming.length} cameras unmounted, ${toDelete.length} systems deleted.`);
await sql.end();
