/**
 * Fold cameras.sensor_size and cameras.body_type into the site's vocabulary.
 *
 * Both columns are exact-match facets, and three importers had filled them in
 * three dialects. This pass runs every live row through the same normalisers
 * the write paths use (src/lib/sensor-size.ts, src/lib/body-type.ts) and then
 * repairs what a label alone cannot:
 *
 * - Whether a body is digital. A megapixel count is the usual signal, but
 *   special editions from lens-db.com carry none, so a Leica M11 edition was
 *   labelled "35mm" as if it took film. A sensor type, an "Imaging sensor" or
 *   "Effective pixels" spec, a digital-only sensor size, a digital-only mount,
 *   or a digital body of the same name in the same mount ("Leica M11" for
 *   "Leica M11 "100 Years of Leica"") all count.
 * - Body types the lens-db.com import got wrong: it wrote "DSLR" on every
 *   digital body. On a mirrorless-only mount that is Mirrorless, on Leica M it
 *   is Rangefinder, and on a handful of named rows it is a digital back.
 * - camera-wiki digital compacts that arrived as "DSLR" (listed by id below).
 * - Blank body types, filled only from evidence: a spec phrase that names a
 *   body ("6x6 TLR camera"), a built-in rangefinder spec, or a mount that only
 *   ever took one kind of body. Mounts that mixed kinds (Leica screw mount,
 *   Deckel) are left blank rather than guessed.
 *
 * Dry run by default; it prints every transition with counts, the rows whose
 * digital status was inferred, and the facet lists as they would read after.
 * --apply writes: before-values go to a JSONL backup first, then each chunk is
 * one transaction (UPDATE pinned by id and current values, re-select, one
 * insert of patrolled revisions). The "cameras" tag is revalidated once at the
 * end when CRON_SECRET is set, since both columns feed list facets.
 *
 * Usage (from frontend/):
 *   node scripts/normalize-camera-vocabulary.mjs
 *   node scripts/normalize-camera-vocabulary.mjs --apply
 *   node scripts/normalize-camera-vocabulary.mjs --apply --backup ~/Work/camera-vocabulary.before.jsonl
 *
 * Requires DATABASE_URL (in .env.local); CRON_SECRET to revalidate.
 */

import { createPool } from "./lib/db.mjs";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { normalizeSensorSize, SENSOR_SIZES } from "../src/lib/sensor-size.ts";
import { normalizeBodyType, isKnownBodyType } from "../src/lib/body-type.ts";

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
const BACKUP = resolve(argVal("--backup", `${homedir()}/Work/camera-vocabulary.before.${today}.jsonl`));
const SPEC_KEY = "Maximum format";

// Mounts that only ever took digital, mirrorless bodies.
const MIRRORLESS_MOUNTS = new Set([
  "Sony E", "Nikon Z", "Canon RF", "Canon EF-M", "Fujifilm X", "Fujifilm G",
  "Hasselblad X", "Leica L", "Micro Four Thirds", "Samsung NX", "Samsung NX-M",
  "Nikon 1", "Pentax Q",
]);
const DIGITAL_ONLY_MOUNTS = new Set([...MIRRORLESS_MOUNTS, "Four Thirds"]);

// Mounts whose interchangeable-lens bodies are all reflex cameras.
const SLR_MOUNTS = new Set([
  "M42", "Pentax K", "Nikon F", "Canon EF", "Canon FD", "Canon FL", "Canon R",
  "Minolta SR", "Minolta/Sony A", "Contax/Yashica", "Olympus OM", "Olympus OM AF",
  "Olympus Pen F", "Leica R", "Konica AR", "Konica F", "Exakta", "VP Exakta",
  "Exakta 66", "Exakta 66 (vertical)", "Exakta 6x6 (horizontal)", "Exakta real",
  "Miranda", "Praktica B", "Topcon", "Topcon UV", "Rollei QBM", "Pentax 645",
  "Pentax 6×7", "Mamiya M645", "Mamiya RB67", "Mamiya RZ67", "Mamiya CS",
  "Mamiya E", "Mamiya ES", "Hasselblad V", "Hasselblad H",
  "Hasselblad 1600F/1000F (M60×6)", "Bronica", "Bronica ETR", "Bronica SQ",
  "Bronica GS-1", "Rolleiflex SL66", "Rolleiflex SLX / 6000",
  "Pentacon Six (Praktisix)", "Kowa Six", "Norita 66", "Contarex", "Icarex",
  "Praktiflex", "Praktina", "Primarflex", "Rectaflex", "Reflex-Korelle I-II",
  "Reflex-Korelle III", "Meister-Korelle", "Wrayflex", "Zenit M39 (SLR)", "Start",
  "Salyut", "Asahiflex M37", "Petri", "Petri Penta V", "Yashica Pentamatic",
  "Yashica MA", "Fujica X", "Alpa", "Agiflex", "Contax N", "Contax 645",
  "Leica S", "Sigma SA", "Four Thirds",
]);
// Hasselblad's superwide and tilt bodies share the V mount but have no mirror.
const NOT_AN_SLR = /\b(SWC|SWA|SW|903 ?SWC|905 ?SWC|FlexBody|ArcBody)\b/;

// Mounts whose bodies all focus with a rangefinder.
const RANGEFINDER_MOUNTS = new Set([
  "Nikon S", "Contax Rangefinder", "Contax G", "Mamiya 6", "Mamiya 7",
  "Bronica RF645", "Fujica G690", "Canon S (J)", "Ektra", "Hasselblad XPan",
  "Agfa Ambi Silette",
]);
// Leica M bodies without a rangefinder: the M1 and the MD family, and the
// finderless Zeiss Ikon SW. Everything else on the mount has one.
const LEICA_M_WITHOUT_RANGEFINDER = /^(Leica (M1|MD|MDa|MD-2)\b|Zeiss Ikon SW\b)/;

const DIGITAL_BACK = /^(Hasselblad (CFV|CFH|CF-\d+|V96C)|Kodak (PB645|ProBack)|Leica Digital-Modul-R|Fujifilm DBP)\b/;
// The M EV1 takes M lenses but focuses through an electronic finder, with no
// rangefinder, so the Leica M rule below must not claim it.
const MIRRORLESS_BY_NAME = /^(Pentax K-01|Ricoh GXR|Leica M EV1)\b/;
// Hasselblad H bodies with an integrated back, and Pixii, carry no megapixels.
const DIGITAL_BY_NAME = /^(Hasselblad H\dD|Pixii)/;

// camera-wiki digital bodies that arrived as "DSLR". Most are compacts; three
// are fixed-lens cameras with a reflex finder, and the "Nikon 1" article
// describes the mirrorless system.
const BODY_OVERRIDES = new Map([
  [4280, "Compact"], // Agfa ePhoto 780
  [5234, "Compact"], // Contax U4R
  [5235, "Compact"], // Digital Classic Camera Leica M3
  [5124, "Compact"], // Fujifilm DS-7
  [5121, "Compact"], // Fujifilm MX-1200
  [5128, "Compact"], // Fujifilm MX-700
  [4185, "Compact"], // Kodak DC5000 Zoom
  [4935, "Compact"], // Konica Q-M100
  [4513, "Compact"], // Minolta Dimâge EX
  [4514, "Compact"], // Minolta Dimâge V
  [4679, "Compact"], // Olympus C-21
  [4671, "Compact"], // Olympus C-40 Zoom
  [4673, "Compact"], // Olympus C-830L
  [4686, "Compact"], // Olympus Camedia C-1
  [4635, "Compact"], // Olympus D-380
  [4677, "Compact"], // Olympus IR-500
  [4674, "Compact"], // Olympus μ 1030 SW
  [4675, "Compact"], // Olympus μ 1050 SW
  [4662, "Compact"], // Olympus µ 720 SW
  [4676, "Compact"], // Olympus μ-mini Digital
  [4866, "Compact"], // Pentax EI-100
  [4865, "Compact"], // Pentax EI-200
  [4988, "Compact"], // Ricoh G600
  [5007, "Compact"], // Ricoh RDC-6000
  [5203, "Compact"], // Rollei dr5
  [4631, "DSLR"], // Olympus C-2500L
  [4637, "DSLR"], // Olympus D-620L / C-1400XL
  [4860, "DSLR"], // Pentax EI-2000
  [4827, "Mirrorless"], // Nikon 1
]);

const DIGITAL_SIZES = new Set(SENSOR_SIZES.digital);
const blankToNull = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

const CAMEL_SKIP = new Set(["viewCount", "averageRating", "ratingCount", "submittedByIp"]);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function snapshot(row) {
  const s = {};
  for (const [k, v] of Object.entries(row)) if (!CAMEL_SKIP.has(camel(k))) s[camel(k)] = v;
  return s;
}

/** Why a row counts as digital on its own evidence, or null. */
function ownDigitalReason(r) {
  const s = r.specs ?? {};
  if (r.megapixels != null) return "megapixels";
  if (blankToNull(r.sensor_type)) return "sensor type";
  if (blankToNull(s["Imaging sensor"]) || blankToNull(s["Effective pixels"])) return "sensor spec";
  if (/^(bsi-|stacked )?(cmos|ccd)\b|\bdigital\b/i.test(s.Type ?? "")) return "type spec";
  // Read as film, so a measured frame ("18 x 24 mm") is never taken for a
  // sensor class and "35mm" stays 35mm; only a label that names a sensor counts.
  const size = normalizeSensorSize(r.sensor_size, false);
  if (size && DIGITAL_SIZES.has(size)) return `sensor size ${size}`;
  if (DIGITAL_ONLY_MOUNTS.has(r.system)) return `mount ${r.system}`;
  if (DIGITAL_BACK.test(r.name) || DIGITAL_BY_NAME.test(r.name)) return "name";
  return null;
}

function decideSize(r, digital) {
  const before = blankToNull(r.sensor_size);
  let after = normalizeSensorSize(before, digital);
  const film = String(r.specs?.Film ?? r.specs?.["Film type"] ?? "");
  // Every Fujifilm G and Hasselblad X sensor is the 43.8 x 32.9 mm one.
  if (after === "Medium format" && digital && (r.system === "Fujifilm G" || r.system === "Hasselblad X")) {
    after = "Medium format 44x33";
  }
  // 6.5x9 cm is a plate size, unless the camera takes 120 or 620 roll film,
  // whose frame of that name is 6x9.
  if (before === "Medium format 6.5x9" && /\b(120|620)\b/.test(film)) after = "Medium format 6x9";
  // "Medium format 120" on a camera whose film spec names another roll film.
  if (before === "Medium format 120") {
    const n = film.trim().match(/^(\d{3}) film$/);
    if (n) after = normalizeSensorSize(`${n[1]} film`, false);
  }
  return after;
}

function decideBody(r, digital) {
  if (BODY_OVERRIDES.has(r.id)) return BODY_OVERRIDES.get(r.id);
  if (DIGITAL_BACK.test(r.name)) return "Digital back";
  if (MIRRORLESS_BY_NAME.test(r.name)) return "Mirrorless";
  let after = normalizeBodyType(blankToNull(r.body_type), digital);
  if (digital && MIRRORLESS_MOUNTS.has(r.system) && (after === null || after === "DSLR")) {
    after = "Mirrorless";
  }
  if (digital && r.system === "Leica M" && (after === null || after === "DSLR" || after === "Mirrorless")) {
    after = "Rangefinder";
  }
  if (after !== null) return after;

  // A blank label, filled only from evidence.
  const s = r.specs ?? {};
  const type = String(s.Type ?? "");
  const fromType = normalizeBodyType(type, digital);
  if (isKnownBodyType(fromType) && !/shutter|focal-plane|leaf/i.test(type)) return fromType;
  if (/^built-in/i.test(String(s.Rangefinder ?? "")) || blankToNull(s["Effective rangefinder base"])) {
    return "Rangefinder";
  }
  if (r.system === "Leica M" && !LEICA_M_WITHOUT_RANGEFINDER.test(r.name)) return "Rangefinder";
  if (RANGEFINDER_MOUNTS.has(r.system)) return "Rangefinder";
  if (SLR_MOUNTS.has(r.system) && !NOT_AN_SLR.test(r.name)) return digital ? "DSLR" : "SLR";
  if (r.system === "Mamiya TLR") return "TLR";
  if (r.system === "Fuji GX617") return "Panoramic";
  return null;
}

/** Every decision for the catalogue, sibling editions resolved in a second pass. */
function decideAll(rows) {
  const own = new Map(rows.map((r) => [r.id, ownDigitalReason(r)]));
  const digitalBySystem = new Map();
  for (const r of rows) {
    if (!own.get(r.id) || r.system_id == null) continue;
    if (!digitalBySystem.has(r.system_id)) digitalBySystem.set(r.system_id, []);
    digitalBySystem.get(r.system_id).push(r);
  }

  const first = new Map();
  for (const r of rows) {
    const digital = own.get(r.id) !== null;
    first.set(r.id, { size: decideSize(r, digital), body: decideBody(r, digital) });
  }

  const decisions = [];
  for (const r of rows) {
    let reason = own.get(r.id);
    let { size, body } = first.get(r.id);

    // A special edition shares its body with the model it is named after.
    let sibling = null;
    if (r.system_id != null && (r.year_introduced == null || r.year_introduced >= 2000)) {
      for (const cand of digitalBySystem.get(r.system_id) ?? []) {
        if (cand.id === r.id || cand.name.length < 6) continue;
        if (!r.name.startsWith(`${cand.name} `)) continue;
        if (!sibling || cand.name.length > sibling.name.length) sibling = cand;
      }
    }
    if (sibling) {
      const sib = first.get(sibling.id);
      if (!reason) {
        reason = `edition of ${sibling.name}`;
        size = decideSize(r, true);
        body = decideBody(r, true);
      }
      if (size === null && sib.size) size = sib.size;
      if (body === null && sib.body) body = sib.body;
    }

    const beforeSize = blankToNull(r.sensor_size);
    const beforeBody = blankToNull(r.body_type);
    const specBefore = r.specs?.[SPEC_KEY];
    const specChanges = size !== null && beforeSize !== null && specBefore === beforeSize && size !== beforeSize;
    decisions.push({
      row: r,
      digitalReason: reason,
      inferredDigital: r.megapixels == null && reason !== null,
      beforeSize,
      size,
      beforeBody,
      body,
      sizeChanges: size !== beforeSize,
      bodyChanges: body !== beforeBody,
      specChanges,
    });
  }
  return decisions;
}

function tally(items, key) {
  const m = new Map();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function writeChunk(client, decisions) {
  const ids = decisions.map((d) => d.row.id);
  const { rows: before } = await client.query(`select * from cameras where id = any($1::int[])`, [ids]);
  for (const b of before) appendFileSync(BACKUP, JSON.stringify({ table: "cameras", ...b }) + "\n");

  await client.query("begin");
  try {
    for (const d of decisions) {
      const r = await client.query(
        `update cameras
            set sensor_size = $2,
                body_type = $3,
                specs = case when $6::boolean then jsonb_set(specs, array[$7]::text[], to_jsonb($2::text)) else specs end
          where id = $1
            and sensor_size is not distinct from $4
            and body_type is not distinct from $5`,
        [d.row.id, d.size, d.body, d.row.sensor_size, d.row.body_type, d.specChanges, SPEC_KEY],
      );
      if (r.rowCount !== 1) throw new Error(`#${d.row.id} ${d.row.name}: changed since the dry run`);
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
      const parts = [];
      if (d.sizeChanges) {
        fields.push("sensorSize");
        parts.push(`sensor size ${d.beforeSize ?? "blank"} → ${d.size ?? "blank"}`);
      }
      if (d.bodyChanges) {
        fields.push("bodyType");
        parts.push(`body type ${d.beforeBody ?? "blank"} → ${d.body ?? "blank"}`);
      }
      if (d.specChanges) fields.push("specs");
      rp.push(
        d.row.id,
        nextById.get(d.row.id) ?? 1,
        JSON.stringify(snapshot(afterById.get(d.row.id))),
        `Camera vocabulary: ${parts.join(", ")} (label cleanup, ${today})`,
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
    `select c.id, c.name, c.slug, c.megapixels, c.sensor_type, c.sensor_size, c.body_type,
            c.year_introduced, c.system_id, s.name as system, c.specs
       from cameras c left join systems s on s.id = c.system_id
      where c.merged_into_id is null
      order by c.id`,
  );
  const all = decideAll(rows);
  const changed = all.filter((d) => d.sizeChanges || d.bodyChanges);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${rows.length} live cameras, ${changed.length} change`);
  console.log(`   sensor size changes: ${all.filter((d) => d.sizeChanges).length}`);
  console.log(`   body type changes:   ${all.filter((d) => d.bodyChanges).length}`);
  console.log(`   spec-key mirrors:    ${all.filter((d) => d.specChanges).length}\n`);

  console.log("Sensor size transitions:");
  for (const [k, n] of tally(all.filter((d) => d.sizeChanges), (d) => `${d.beforeSize ?? "(blank)"} → ${d.size ?? "(blank)"}`)) {
    console.log(`   ${String(n).padStart(5)}  ${k}`);
  }
  console.log("\nBody type transitions:");
  for (const [k, n] of tally(all.filter((d) => d.bodyChanges), (d) => `${d.beforeBody ?? "(blank)"} → ${d.body ?? "(blank)"}`)) {
    console.log(`   ${String(n).padStart(5)}  ${k}`);
  }

  console.log("\nDigital without megapixels (inferred):");
  for (const [k, n] of tally(all.filter((d) => d.inferredDigital), (d) => d.digitalReason.replace(/^edition of .*/, "edition of a digital model"))) {
    console.log(`   ${String(n).padStart(5)}  ${k}`);
  }
  for (const d of all.filter((x) => x.digitalReason?.startsWith("edition of"))) {
    console.log(`          #${d.row.id} ${d.row.name}  (${d.digitalReason})`);
  }

  console.log("\nBlank body type filled, by source mount:");
  for (const [k, n] of tally(all.filter((d) => d.beforeBody === null && d.body !== null), (d) => `${d.row.system ?? "(no mount)"} → ${d.body}`)) {
    console.log(`   ${String(n).padStart(5)}  ${k}`);
  }
  console.log("\nStill blank body type after, by mount:");
  for (const [k, n] of tally(all.filter((d) => d.body === null), (d) => d.row.system ?? "(no mount)").slice(0, 25)) {
    console.log(`   ${String(n).padStart(5)}  ${k}`);
  }

  console.log("\nSensor size facet after:");
  for (const [k, n] of tally(all, (d) => d.size ?? "(blank)")) console.log(`   ${String(n).padStart(5)}  ${k}`);
  console.log("\nBody type facet after:");
  for (const [k, n] of tally(all, (d) => d.body ?? "(blank)")) console.log(`   ${String(n).padStart(5)}  ${k}`);

  if (args.includes("--list")) {
    console.log("\nEvery changed row:");
    for (const d of changed) {
      const parts = [];
      if (d.sizeChanges) parts.push(`size ${d.beforeSize ?? "-"} → ${d.size ?? "-"}`);
      if (d.bodyChanges) parts.push(`body ${d.beforeBody ?? "-"} → ${d.body ?? "-"}`);
      console.log(`   #${d.row.id} ${d.row.name} [${d.row.system ?? "no mount"}]  ${parts.join("; ")}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write (--list prints every row).");
  } else {
    const client = await pool.connect();
    try {
      let n = 0;
      for (let i = 0; i < changed.length; i += CHUNK) {
        await writeChunk(client, changed.slice(i, i + CHUNK));
        n += Math.min(CHUNK, changed.length - i);
        process.stdout.write(`   wrote ${n}/${changed.length}\r`);
      }
      console.log(`\n   wrote ${n} cameras with revisions; before-values in ${BACKUP}\n`);
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
