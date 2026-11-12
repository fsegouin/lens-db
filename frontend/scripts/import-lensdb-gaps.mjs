/**
 * Import the lens-db.com gaps that need no further review.
 *
 * Reads enriched.json (enrich-lensdb-gaps.mjs) and the reviewer's decisions
 * exported from the gap review page, then creates catalogue rows for:
 *   - every "ready" item the reviewer has not rejected (every field a page
 *     must carry was agreed by both models, or settled from the catalogue), and
 *   - every item the reviewer approved, with their edits applied.
 * "Match check" approvals (the models disagreed on whether we already had the
 * item) are not imported here: they still need drafting.
 *
 * Only agreed values and reviewer edits are written; a field the two models
 * disagreed on stays blank. Each row gets:
 *   - `url` = its lens-db.com page, the entry it came from;
 *   - revision 1, a snapshot of the new row, with no user, like other scripts;
 *   - every agreed mount in lens_systems (the trigger adds the primary one);
 *   - a field_citations row only for a figure taken from an external
 *     published source (camera-wiki). Citations are public and mark a figure
 *     as checked; model recall, catalogue conventions and reviewer edits are
 *     never cited, so those figures stay unmarked like any unchecked value.
 * A new system named by the reviewer is created first, with its name as given.
 *
 * Idempotent: an item whose lens-db URL (or slug) is already in the catalogue
 * is skipped, so a later run only adds what has been approved since.
 *
 * Usage (from frontend/):
 *   node scripts/import-lensdb-gaps.mjs                 # dry run
 *   node scripts/import-lensdb-gaps.mjs --apply         # write
 *   node scripts/import-lensdb-gaps.mjs --decisions <dir of exported decision JSON files>
 *
 * Afterwards: POST /api/cron/revalidate with {"tags":["lenses","cameras"]}
 * (new rows appear in lists and on system pages).
 */

import { createSql, createPool } from "./lib/db.mjs";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { normalizeCoverage, normalizeEra, normalizeProductionStatus, normalizeLensType } from "../src/lib/vocabularies.ts";
import { normalizeSensorSize } from "../src/lib/sensor-size.ts";
import { normalizeBodyType } from "../src/lib/body-type.ts";
import { normalizeShutterType } from "../src/lib/shutter.ts";
import { isCatalogueSlug, isLensDbUrl } from "./lib/lensdb-source.mjs";

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
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const APPLY = args.includes("--apply");
const DIR = resolve(argVal("--dir", "../scraper/lensdb-sitemap"));
const DECISIONS = resolve(argVal("--decisions", join(DIR, "decisions-export/decisions")));

// Public: shown on /changes and the entity's history. Sources are never named here.
const SUMMARY = "Added to the catalogue";

// ---------------------------------------------------------------------------

function loadDecisions() {
  const map = new Map();
  if (!existsSync(DECISIONS)) return map;
  for (const f of readdirSync(DECISIONS)) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(DECISIONS, f), "utf8"));
    const data = doc.data ?? doc;
    map.set(f.slice(0, -5), data);
  }
  return map;
}

const itemId = (r) => `${r.kind === "camera" ? "camera" : "lens"}--${r.slug}`.slice(0, 190);
const blank = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

/** The value to write for a field and where it came from, or null. */
function valueOf(rec, decision, field) {
  const edits = decision?.edits ?? {};
  if (field in edits) return blank(edits[field]) ? null : { value: edits[field], source: "editor" };
  const f = rec.fields[field];
  if (!f || f.state !== "agreed" || blank(f.value)) return null;
  if (f.source === "lens-db slug") return { value: f.value, source: "lens-db" };
  if (f.source === "camera-wiki") return { value: f.value, source: "camera-wiki", url: f.source_url };
  if (f.source) return { value: f.value, source: "catalogue", note: f.source };
  return { value: f.value, source: "models" };
}

const LENS_COLUMNS = {
  brand: "brand", lens_type: "lens_type", era: "era", production_status: "production_status",
  year_introduced: "year_introduced", year_discontinued: "year_discontinued",
  focal_length_min: "focal_length_min", focal_length_max: "focal_length_max",
  aperture_min: "aperture_min", aperture_max: "aperture_max", weight_g: "weight_g",
  filter_size_mm: "filter_size_mm", min_focus_distance_m: "min_focus_distance_m",
  max_magnification: "max_magnification", lens_elements: "lens_elements", lens_groups: "lens_groups",
  diaphragm_blades: "diaphragm_blades", coverage: "coverage", has_autofocus: "has_autofocus",
  has_stabilization: "has_stabilization", is_macro: "is_macro",
};
const CAMERA_COLUMNS = {
  sensor_type: "sensor_type", sensor_size: "sensor_size", megapixels: "megapixels",
  year_introduced: "year_introduced", year_discontinued: "year_discontinued",
  production_status: "production_status", body_type: "body_type", shutter_type: "shutter_type", weight_g: "weight_g",
};
// Schema field names (camelCase) for field_citations, which address fields as drizzle does.
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function mountSpec(mounts, systemsByName) {
  return mounts
    .map((m) => {
      const flange = systemsByName.get(m)?.flange_distance_mm;
      return flange ? `${m}[${flange}mm]` : m;
    })
    .join("; ");
}

function buildLens(rec, decision, systemsByName) {
  const row = {};
  const cites = [];
  for (const [field, col] of Object.entries(LENS_COLUMNS)) {
    const v = valueOf(rec, decision, field);
    if (!v) continue;
    let value = v.value;
    if (col === "coverage") value = normalizeCoverage(String(value));
    else if (col === "era") value = normalizeEra(String(value));
    else if (col === "production_status") value = normalizeProductionStatus(String(value));
    else if (col === "lens_type") value = normalizeLensType(String(value));
    if (blank(value)) continue;
    row[col] = value;
    cites.push({ field: camel(col), ...v });
  }
  const sys = valueOf(rec, decision, "system");
  const mountsV = valueOf(rec, decision, "mounts");
  let mounts = Array.isArray(mountsV?.value) ? [...mountsV.value] : [];
  if (sys) mounts = [sys.value, ...mounts.filter((m) => m !== sys.value)];
  row.focal_length_max ??= row.focal_length_min;
  row.aperture_max ??= row.aperture_min;
  row.is_zoom = row.focal_length_min != null && row.focal_length_max != null && row.focal_length_min !== row.focal_length_max;
  row.is_prime = row.focal_length_min != null && !row.is_zoom;
  if (row.is_macro == null && /macro/i.test(row.lens_type ?? "")) row.is_macro = true;
  const specs = {};
  if (mounts.length) specs["Mount and Flange focal distance"] = mountSpec(mounts, systemsByName);
  if (row.lens_elements && row.lens_groups) specs["Lens construction"] = `${row.lens_elements} elements in ${row.lens_groups} groups`;
  if (row.year_introduced) specs["Announced"] = String(row.year_introduced);
  return { row, cites, system: sys, mounts, specs };
}

function buildCamera(rec, decision, systemsByName) {
  const row = {};
  const cites = [];
  const mp = valueOf(rec, decision, "megapixels")?.value ?? null;
  const digital = mp ?? !!valueOf(rec, decision, "sensor_type");
  for (const [field, col] of Object.entries(CAMERA_COLUMNS)) {
    const v = valueOf(rec, decision, field);
    if (!v) continue;
    let value = v.value;
    if (col === "sensor_size") value = normalizeSensorSize(value, digital);
    else if (col === "body_type") value = normalizeBodyType(value, digital);
    else if (col === "shutter_type") value = normalizeShutterType(value);
    else if (col === "production_status") value = normalizeProductionStatus(String(value));
    if (blank(value)) continue;
    row[col] = value;
    cites.push({ field: camel(col), ...v });
  }
  const sys = valueOf(rec, decision, "system");
  const specs = {};
  const speeds = valueOf(rec, decision, "shutter_speeds");
  const metering = valueOf(rec, decision, "metering");
  if (speeds) { specs["Speeds"] = String(speeds.value); cites.push({ field: "specs.Speeds", ...speeds }); }
  if (metering) { specs["Exposure metering"] = String(metering.value); cites.push({ field: "specs.Exposure metering", ...metering }); }
  if (sys) specs["Mount and Flange focal distance"] = mountSpec([sys.value], systemsByName);
  if (row.year_introduced) specs["Announced"] = String(row.year_introduced);
  return { row, cites, system: sys, mounts: sys ? [sys.value] : [], specs };
}

function snapshot(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (["view_count", "average_rating", "rating_count", "submitted_by_ip"].includes(k)) continue;
    out[camel(k)] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------

async function main() {
  const enriched = JSON.parse(readFileSync(join(DIR, "enriched.json"), "utf8"));
  const decisions = loadDecisions();
  const sql = createSql();

  const systems = await sql`SELECT id, name, slug, flange_distance_mm FROM systems`;
  const systemsByName = new Map(systems.map((s) => [s.name, s]));
  const lensUrls = new Set((await sql`SELECT url FROM lenses WHERE url IS NOT NULL`).map((r) => r.url));
  const cameraUrls = new Set((await sql`SELECT url FROM cameras WHERE url IS NOT NULL`).map((r) => r.url));
  const lensSlugs = new Set((await sql`SELECT slug FROM lenses`).map((r) => r.slug));
  const cameraSlugs = new Set((await sql`SELECT slug FROM cameras`).map((r) => r.slug));

  const plan = [];
  const skipped = { rejected: 0, notApproved: 0, exists: 0, slugTaken: [], noSystem: [], fixedLens: [], badSource: [] };
  const newSystems = new Map();
  for (const rec of enriched) {
    const decision = decisions.get(itemId(rec));
    if (decision?.decision === "rejected") { skipped.rejected++; continue; }
    const eligible = rec.status === "ready" || decision?.decision === "approved";
    if (!eligible) { skipped.notApproved++; continue; }
    const isCamera = rec.kind === "camera";
    if ((isCamera ? cameraUrls : lensUrls).has(rec.url)) { skipped.exists++; continue; }
    // lens-db's slug is the catalogue's slug convention for rows from that site.
    const slug = rec.slug;
    // Both come from a third-party sitemap: see lib/lensdb-source.mjs.
    if (!isCatalogueSlug(slug) || !isLensDbUrl(rec.url)) { skipped.badSource.push(rec.url); continue; }
    if ((isCamera ? cameraSlugs : lensSlugs).has(slug)) { skipped.slugTaken.push(slug); continue; }
    const built = isCamera ? buildCamera(rec, decision, systemsByName) : buildLens(rec, decision, systemsByName);
    if (!built.system && !isCamera) { skipped.noSystem.push(rec.name); continue; }
    // A camera with no mount is a fixed-lens body. Its lens needs a row of its
    // own for cameras.built_in_lens_id to point at; the body alone would be a
    // page with no mount and no lens, so it waits until that lens exists.
    if (!built.system && isCamera) {
      const lens = valueOf(rec, decision, "built_in_lens")?.value;
      skipped.fixedLens.push(lens ? `${rec.name} (${lens})` : rec.name);
      continue;
    }
    for (const m of built.mounts) if (!systemsByName.has(m)) newSystems.set(m, (newSystems.get(m) ?? 0) + 1);
    plan.push({ rec, decision, built, slug, isCamera, name: (decision?.name || rec.name).trim(), description: decision?.description ?? rec.description ?? null });
  }

  const lenses = plan.filter((p) => !p.isCamera).length;
  const cameras = plan.length - lenses;
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${plan.length} to import (${lenses} lenses, ${cameras} cameras)`);
  console.log(`  from ready: ${plan.filter((p) => p.rec.status === "ready").length}, from reviewer approvals: ${plan.filter((p) => p.rec.status !== "ready").length}, with edits: ${plan.filter((p) => p.decision?.edits && Object.keys(p.decision.edits).length).length}`);
  console.log(`  skipped: ${skipped.rejected} rejected, ${skipped.notApproved} awaiting review, ${skipped.exists} already in the catalogue, ${skipped.slugTaken.length} slug taken, ${skipped.noSystem.length} without a system, ${skipped.fixedLens.length} fixed-lens cameras held back, ${skipped.badSource.length} with a malformed slug or url`);
  if (skipped.slugTaken.length) console.log(`  slug taken: ${skipped.slugTaken.join(", ")}`);
  if (skipped.badSource.length) console.log(`  malformed slug or url: ${skipped.badSource.join(", ")}`);
  if (skipped.noSystem.length) console.log(`  no system: ${skipped.noSystem.join(" | ")}`);
  if (skipped.fixedLens.length) console.log(`  fixed-lens cameras, need their lens row first: ${skipped.fixedLens.join(" | ")}`);
  if (newSystems.size) console.log(`  NEW SYSTEMS to create: ${[...newSystems].map(([n, c]) => `${n} (${c})`).join(", ")}`);
  const fill = {};
  for (const p of plan) for (const k of Object.keys(p.built.row)) fill[k] = (fill[k] ?? 0) + 1;
  console.log(`  fields filled: ${Object.entries(fill).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`  descriptions: ${plan.filter((p) => p.description).length}/${plan.length}`);
  writeFileSync(join(DIR, "import-plan.json"), JSON.stringify(plan.map((p) => ({ name: p.name, slug: p.slug, kind: p.rec.kind, system: p.built.system?.value, mounts: p.built.mounts, row: p.built.row, specs: p.built.specs })), null, 1));

  if (!APPLY) {
    console.log(`\nPlan written to import-plan.json. Re-run with --apply to write.`);
    process.exit(0);
  }

  // New systems first, named exactly as the reviewer gave them.
  const systemSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const unusable = [...newSystems.keys()].filter((name) => !systemSlug(name));
  if (unusable.length) throw new Error(`New system names with no usable slug: ${unusable.join(", ")}`);
  const systemsBySlug = new Map(systems.map((s) => [s.slug, s]));
  for (const name of newSystems.keys()) {
    const slug = systemSlug(name);
    // "canon fd" from a reviewer is the existing Canon FD row, not a new mount.
    const existing = systemsBySlug.get(slug);
    if (existing) {
      systemsByName.set(name, existing);
      console.log(`"${name}" is the existing system #${existing.id} ${existing.name}`);
      continue;
    }
    const [s] = await sql`INSERT INTO systems (name, slug) VALUES (${name}, ${slug}) RETURNING id, name, slug, flange_distance_mm`;
    systemsByName.set(name, s);
    systemsBySlug.set(slug, s);
    console.log(`created system #${s.id} ${name}`);
  }

  // One dedicated connection, so each item's BEGIN, inserts and COMMIT share a
  // session (the script's usual pool hands queries to any of its connections).
  const pool = createPool(undefined, { max: 1 });
  const client = await pool.connect();
  const q = async (text, params = []) => (await client.query(text, params)).rows;

  const created = [];
  let failed = 0;
  for (const p of plan) {
    const { rec, built } = p;
    const systemId = built.system ? systemsByName.get(built.system.value)?.id ?? null : null;
    const r = built.row;
    try {
      await q("BEGIN");
      let row;
      if (p.isCamera) {
        [row] = await q(
          `INSERT INTO cameras (name, slug, url, system_id, description, sensor_type, sensor_size, megapixels, year_introduced,
             year_discontinued, production_status, body_type, shutter_type, weight_g, specs)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) RETURNING *`,
          [p.name, p.slug, rec.url, systemId, p.description, r.sensor_type ?? null, r.sensor_size ?? null, r.megapixels ?? null,
           r.year_introduced ?? null, r.year_discontinued ?? null, r.production_status ?? null, r.body_type ?? null,
           r.shutter_type ?? null, r.weight_g ?? null, JSON.stringify(built.specs)],
        );
      } else {
        [row] = await q(
          `INSERT INTO lenses (name, slug, url, brand, system_id, description, lens_type, era, production_status,
             focal_length_min, focal_length_max, aperture_min, aperture_max, weight_g, filter_size_mm, min_focus_distance_m,
             max_magnification, lens_elements, lens_groups, diaphragm_blades, year_introduced, year_discontinued,
             is_zoom, is_macro, is_prime, has_stabilization, has_autofocus, coverage, specs)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)
           RETURNING *`,
          [p.name, p.slug, rec.url, r.brand ?? null, systemId, p.description, r.lens_type ?? null, r.era ?? null,
           r.production_status ?? null, r.focal_length_min ?? null, r.focal_length_max ?? null, r.aperture_min ?? null,
           r.aperture_max ?? null, r.weight_g ?? null, r.filter_size_mm ?? null, r.min_focus_distance_m ?? null,
           r.max_magnification ?? null, r.lens_elements ?? null, r.lens_groups ?? null, r.diaphragm_blades ?? null,
           r.year_introduced ?? null, r.year_discontinued ?? null, r.is_zoom, r.is_macro ?? false, r.is_prime,
           r.has_stabilization ?? false, r.has_autofocus ?? false, r.coverage ?? null, JSON.stringify(built.specs)],
        );
        for (const m of built.mounts.slice(1)) {
          const sid = systemsByName.get(m)?.id;
          if (sid) await q("INSERT INTO lens_systems (lens_id, system_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [row.id, sid]);
        }
      }
      const type = p.isCamera ? "camera" : "lens";
      await q(
        `INSERT INTO revisions (entity_type, entity_id, revision_number, data, summary, changed_fields)
         VALUES ($1, $2, 1, $3::jsonb, $4, '[]'::jsonb)`,
        [type, row.id, JSON.stringify(snapshot(row)), SUMMARY],
      );
      // Only external published sources are cited (see the header).
      const cites = [...built.cites, ...(built.system ? [{ field: "systemId", ...built.system }] : [])].filter((c) => c.source === "camera-wiki");
      for (const c of cites) {
        await q(
          `INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
           VALUES ($1, $2, $3, 'camera-wiki', $4, NULL) ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
          [type, row.id, c.field, c.url ?? null],
        );
      }
      await q("COMMIT");
      created.push({ type, id: row.id, slug: row.slug });
      if (created.length % 50 === 0) console.log(`  ${created.length}/${plan.length}`);
    } catch (e) {
      await q("ROLLBACK").catch(() => {});
      failed++;
      console.error(`fail ${p.slug}: ${e.message.slice(0, 160)}`);
    }
  }
  client.release();
  writeFileSync(join(DIR, `imported-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`), JSON.stringify(created, null, 1));
  console.log(`created ${created.length}, failed ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
