/**
 * Give every camera a description, from the facts already on its own row.
 *
 * The camera-wiki enrichment writes descriptions, but it selects on the source
 * URL, so it never saw the 52 bodies imported from Wikipedia and DPReview. That
 * left the Kodak DCS660C holding a year, a resolution, a sensor size and a
 * Nikon F mount, and still opening with nothing at all — the row had the facts
 * and the page had no sentence to say them in.
 *
 * This needs no network. Everything it writes is already in the database, and
 * the citations for those fields were recorded when they were imported, so the
 * description inherits provenance rather than claiming any of its own.
 *
 * Usage (from frontend/):
 *   node scripts/backfill-camera-descriptions.mjs            # dry run
 *   node scripts/backfill-camera-descriptions.mjs --apply
 *   node scripts/backfill-camera-descriptions.mjs --overwrite # rewrite existing
 */

import { createSql } from "./lib/db.mjs";
import { composeDescription } from "./lib/camera-wiki-facts.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const overwrite = args.includes("--overwrite");

/**
 * A digital body with no body type still has something to be called. The
 * catalogue's own vocabulary is used, so these read the same as the rest.
 */
function inferBodyType(row) {
  if (row.body_type) return row.body_type;
  if (row.megapixels === null) return null;
  if (/\b(back|proback|pb\d|cfv|cfh|cf-\d|dbp)\b/i.test(row.name)) return "Digital back";
  return "DSLR";
}

/** "27.4 x 18.1 mm" is a sensor; "35mm full frame" is a film format. */
function isSensorMeasurement(sensorSize) {
  return Boolean(sensorSize) && /\d\s*x\s*\d/.test(sensorSize) && /mm/i.test(sensorSize);
}

const sql = createSql();

const rows = await sql.unsafe(`
  select id, name, url, description, year_introduced, body_type, megapixels,
         sensor_size, resolution, weight_g, shutter_type, specs,
         (select name from systems s where s.id = c.system_id) as system
  from cameras c
  where merged_into_id is null
    ${overwrite ? "" : "and description is null"}
  order by id
`);

console.log(`Cameras considered: ${rows.length}`);

const updates = [];
for (const row of rows) {
  const specs = row.specs && typeof row.specs === "object" ? row.specs : {};
  const bodyType = inferBodyType(row);

  // The film format doubles as sensor_size on film bodies, so only a measured
  // sensor counts as one; the format is what the sentence should say instead.
  const film = isSensorMeasurement(row.sensor_size)
    ? null
    : (row.sensor_size ?? specs["Maximum format"] ?? specs.Film ?? null);

  const lensSpec = specs.Lens ? String(specs.Lens).match(/(\d{1,4}(?:\.\d)?)\s*mm\s*(?:f[/ ]|1:)\s*(\d{1,2}(?:\.\d{1,2})?)/i) : null;

  const description = composeDescription({
    name: row.name,
    maker: specs.Manufacturer ?? null,
    bodyType,
    film,
    country: specs.Origin ?? null,
    years: { start: row.year_introduced, end: null },
    lens: lensSpec ? { focal: Number(lensSpec[1]), aperture: Number(lensSpec[2]) } : null,
    sensor: row.megapixels ? { megapixels: row.megapixels, resolution: row.resolution } : null,
    shutter: null,
    weight: row.weight_g,
    system: row.system,
  });

  if (!description || description === row.description) continue;
  updates.push({ id: row.id, name: row.name, description, bodyType: row.body_type ? null : bodyType });
}

console.log(`Descriptions to write: ${updates.length}`);
console.log(`  also setting a body type: ${updates.filter((u) => u.bodyType).length}`);
console.log("\nSample:");
for (const u of updates.slice(0, 10)) console.log(`  ${u.description}`);

if (!apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to update ${updates.length} cameras.`);
  await sql.end();
  process.exit(0);
}

let written = 0;
for (const u of updates) {
  if (u.bodyType) {
    await sql`UPDATE cameras SET description = ${u.description}, body_type = COALESCE(body_type, ${u.bodyType}) WHERE id = ${u.id}`;
  } else {
    await sql`UPDATE cameras SET description = ${u.description} WHERE id = ${u.id}`;
  }
  written++;
  if (written % 200 === 0) process.stdout.write(`\r  written ${written}/${updates.length}`);
}
console.log(`\nUpdated ${written} cameras.`);
await sql.end();
