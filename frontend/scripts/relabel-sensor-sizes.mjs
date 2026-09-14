/**
 * Retire the "35mm full frame" sensor_size label.
 *
 * Two importers disagreed about what to call a 35mm-sized format: the film
 * importers and the old DPReview scrape wrote "35mm full frame", the watcher
 * importer writes "Full frame". So 171 digital bodies (Nikon D700, Sony a7R,
 * Leica M11) sat under the film label while later bodies got the digital
 * one, and the sensor filter on mount pages listed the same format twice.
 *
 * "Full frame" is a digital-era term ("a sensor the size of a 35mm frame"),
 * so it is kept for sensors only, and a film camera is called what people
 * call it: a 35mm camera. This pass writes
 *   - "Full frame" on every "35mm full frame" row that has megapixels,
 *   - "35mm" on every "35mm full frame" row that does not,
 * and rewrites the mirrored specs->>'Maximum format' key the same way, so
 * the spec panel does not keep the old wording.
 *
 * Dry run by default; --apply writes. Before-values go to a JSONL backup
 * first, then each chunk is one transaction: the UPDATE pinned by id and
 * current label, a re-select for the revision snapshots, one insert of
 * patrolled revisions. sensorSize is a list field (mount pages and the
 * cameras index filter on it), so the "cameras" tag is revalidated once at
 * the end when CRON_SECRET is set.
 *
 * Usage (from frontend/):
 *   node scripts/relabel-sensor-sizes.mjs
 *   node scripts/relabel-sensor-sizes.mjs --apply
 *   node scripts/relabel-sensor-sizes.mjs --apply --backup ~/Work/sensor-sizes.before.jsonl
 *
 * Requires DATABASE_URL (in .env.local); CRON_SECRET to revalidate.
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
const CHUNK = 200;
const today = new Date().toISOString().slice(0, 10);
const BACKUP = resolve(argVal("--backup", `${homedir()}/Work/sensor-sizes.before.${today}.jsonl`));

const OLD_LABEL = "35mm full frame";
const SPEC_KEY = "Maximum format";

const CAMEL_SKIP = new Set(["viewCount", "averageRating", "ratingCount", "submittedByIp"]);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function snapshot(row) {
  const s = {};
  for (const [k, v] of Object.entries(row)) if (!CAMEL_SKIP.has(camel(k))) s[camel(k)] = v;
  return s;
}

/** The new label for one row, and whether its specs key needs the same edit. */
function decide(row) {
  const newLabel = row.megapixels != null ? "Full frame" : "35mm";
  const columnChanges = row.sensor_size === OLD_LABEL;
  const specChanges = row.specs?.[SPEC_KEY] === OLD_LABEL;
  return { id: row.id, name: row.name, slug: row.slug, newLabel, columnChanges, specChanges };
}

async function writeChunk(client, decisions) {
  const ids = decisions.map((d) => d.id);
  const { rows: before } = await client.query(`select * from cameras where id = any($1::int[])`, [ids]);
  for (const b of before) appendFileSync(BACKUP, JSON.stringify({ table: "cameras", ...b }) + "\n");

  await client.query("begin");
  try {
    for (const d of decisions) {
      const r = await client.query(
        `update cameras
            set sensor_size = case when sensor_size = $2 then $3 else sensor_size end,
                specs = case when specs->>$4 = $2 then jsonb_set(specs, array[$4]::text[], to_jsonb($3::text)) else specs end
          where id = $1 and (sensor_size = $2 or specs->>$4 = $2)`,
        [d.id, OLD_LABEL, d.newLabel, SPEC_KEY],
      );
      if (r.rowCount !== 1) throw new Error(`#${d.id} ${d.name}: no longer carries "${OLD_LABEL}"`);
    }

    const { rows: after } = await client.query(`select * from cameras where id = any($1::int[])`, [ids]);
    const afterById = new Map(after.map((r) => [r.id, r]));
    const { rows: nexts } = await client.query(
      `select entity_id, coalesce(max(revision_number), 0) + 1 as next from revisions
       where entity_type = 'camera' and entity_id = any($1::int[]) group by entity_id`,
      [ids],
    );
    const nextById = new Map(nexts.map((r) => [r.entity_id, Number(r.next)]));

    const rv = [];
    const rp = [];
    for (const d of decisions) {
      const fields = [];
      if (d.columnChanges) fields.push("sensorSize");
      if (d.specChanges) fields.push("specs");
      rp.push(
        d.id,
        nextById.get(d.id) ?? 1,
        JSON.stringify(snapshot(afterById.get(d.id))),
        `Sensor size ${OLD_LABEL} → ${d.newLabel} (label cleanup, ${today})`,
        JSON.stringify(fields),
      );
      const o = rp.length - 5;
      rv.push(`('camera', $${o + 1}, $${o + 2}, $${o + 3}::jsonb, $${o + 4}, $${o + 5}::jsonb, true, now())`);
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
  const { rows } = await pool.query(
    `select id, name, slug, megapixels, sensor_size, specs from cameras
      where merged_into_id is null and (sensor_size = $1 or specs->>$2 = $1)
      order by id`,
    [OLD_LABEL, SPEC_KEY],
  );
  const decisions = rows.map(decide);
  const digital = decisions.filter((d) => d.newLabel === "Full frame");
  const film = decisions.filter((d) => d.newLabel === "35mm");

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${decisions.length} live cameras carry "${OLD_LABEL}"`);
  console.log(`   → "Full frame" (has megapixels): ${digital.length}`);
  console.log(`   → "35mm" (no megapixels):        ${film.length}`);
  console.log(`   column changes: ${decisions.filter((d) => d.columnChanges).length}, spec-key changes: ${decisions.filter((d) => d.specChanges).length}`);
  console.log(`   digital sample: ${digital.slice(0, 8).map((d) => d.name).join(", ")}`);
  console.log(`   film sample:    ${film.slice(0, 8).map((d) => d.name).join(", ")}\n`);

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write.");
  } else {
    const client = await pool.connect();
    try {
      let n = 0;
      for (let i = 0; i < decisions.length; i += CHUNK) {
        await writeChunk(client, decisions.slice(i, i + CHUNK));
        n += Math.min(CHUNK, decisions.length - i);
        process.stdout.write(`   wrote ${n}/${decisions.length}\r`);
      }
      console.log(`   wrote ${n} cameras with revisions; before-values in ${BACKUP}\n`);
    } finally {
      client.release();
    }

    if (process.env.CRON_SECRET) {
      const r = await fetch(`${process.env.API_URL ?? "https://thelensdb.com"}/api/cron/revalidate`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ tags: ["cameras"] }),
      });
      console.log(`revalidate "cameras": HTTP ${r.status}`);
    } else {
      console.log(`CRON_SECRET not set: call /api/cron/revalidate yourself for the "cameras" tag.`);
    }
  }
} finally {
  await pool.end();
}
