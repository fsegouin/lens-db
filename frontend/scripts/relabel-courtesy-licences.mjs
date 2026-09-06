/**
 * Relabel image licences of the form "Courtesy of <site>" as "Used with
 * permission".
 *
 * The mir.com.my import wrote the courtesy note into the licence field, with
 * the site already in the credit, so the public line read "Photo: mir.com.my
 * · Courtesy of mir.com.my". The admin form now offers "Used with permission"
 * as a preset for exactly this case, and the credit line reads once.
 *
 * Only the licence label changes; credit, source URL and everything else on
 * the image entry are left as they are. Rows are rewritten in one UPDATE per
 * table rather than one per row, since the change is a pure jsonb rewrite.
 *
 *   node scripts/relabel-courtesy-licences.mjs            # dry run
 *   node scripts/relabel-courtesy-licences.mjs --apply    # write
 *
 * Before-values go to ~/Work/lens-db-courtesy-licences-before-<date>.json.
 */
import { createPool } from "./lib/db.mjs";
import { readFileSync, existsSync, writeFileSync } from "fs";
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
const NEW_LABEL = "Used with permission";
const pool = createPool(process.env.DATABASE_URL, { max: 1 });

const affectedSql = (table) => `
  SELECT id, slug, images
  FROM ${table}
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(images) img
    WHERE img->>'license' LIKE 'Courtesy of %'
  )
  ORDER BY id`;

const updateSql = (table) => `
  UPDATE ${table} SET images = (
    SELECT jsonb_agg(
      CASE WHEN img->>'license' LIKE 'Courtesy of %'
           THEN img || jsonb_build_object('license', $1::text)
           ELSE img END
      ORDER BY ord)
    FROM jsonb_array_elements(images) WITH ORDINALITY AS t(img, ord)
  )
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(images) img
    WHERE img->>'license' LIKE 'Courtesy of %'
  )`;

try {
  const before = {};
  const labels = new Map();
  for (const table of ["lenses", "cameras"]) {
    const { rows } = await pool.query(affectedSql(table));
    before[table] = rows;
    for (const row of rows) {
      for (const img of row.images) {
        if (typeof img.license === "string" && img.license.startsWith("Courtesy of ")) {
          labels.set(img.license, (labels.get(img.license) ?? 0) + 1);
        }
      }
    }
    console.log(`${table}: ${rows.length} row(s)`);
  }
  console.log("labels found:");
  for (const [label, n] of labels) console.log(`  ${n.toString().padStart(5)}  ${label}`);

  const backupPath = `${process.env.HOME}/Work/lens-db-courtesy-licences-before-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backupPath, JSON.stringify(before, null, 2));
  console.log(`before-values in ${backupPath}`);

  if (!apply) {
    console.log(`\nDRY RUN, nothing changed. Re-run with --apply to relabel as "${NEW_LABEL}".`);
  } else {
    const paths = [];
    for (const table of ["lenses", "cameras"]) {
      const r = await pool.query(updateSql(table), [NEW_LABEL]);
      console.log(`${table}: ${r.rowCount} row(s) updated`);
      const prefix = table === "lenses" ? "/lenses/" : "/cameras/";
      for (const row of before[table]) paths.push(prefix + row.slug);
    }
    if (process.env.CRON_SECRET) {
      const r = await fetch(`${process.env.API_URL ?? "https://thelensdb.com"}/api/cron/revalidate`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ tags: ["lenses", "cameras"], paths }),
      });
      console.log(`revalidate: HTTP ${r.status}`);
    } else {
      console.log(`CRON_SECRET not set: call /api/cron/revalidate yourself for the "lenses" and "cameras" tags.`);
    }
  }
} finally {
  await pool.end();
}
