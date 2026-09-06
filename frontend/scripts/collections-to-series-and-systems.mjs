/**
 * Move product lines and mounts out of `collections`.
 *
 * `collections` was doing the work of three concepts at once. Alongside the
 * genuinely curated groupings (Soviet lenses, pancakes, soft focus, UV/IR)
 * it held manufacturer product lines, which are what `lens_series` is for,
 * and adapter mounts, which are what `systems` is for. Both duplicates were
 * visible: a Canon L macro showed "Canon L" and "Canon L-series lenses" as
 * two badges in the same list, the same fact twice, and /collections/t-mount-
 * lenses listed 38 lenses where the T-mount system holds 171.
 *
 * In every case the destination already exists and is better populated, so
 * this is a data move, not a rebuild. Two exceptions get built here:
 *
 *   - Sigma Global Vision is Sigma's umbrella over Art, Contemporary and
 *     Sports. All 42 of its lenses are already in one of those three series,
 *     so there is no single series to point at. It becomes its own series,
 *     which is what the name is: a Sigma product line.
 *   - Komura Unidapter has no system at all. Its 20 lenses are scattered over
 *     interchangeable-mount, the two Soligor Unidapter systems and Canon R. It
 *     gets a `systems` row of its own, alongside those Soligor rows.
 *
 * Usage (from frontend/):
 *   node scripts/collections-to-series-and-systems.mjs           # dry run
 *   node scripts/collections-to-series-and-systems.mjs --apply   # write
 *
 * Every collection is pinned by id AND slug; a mismatch aborts before any
 * write. Redirects are NOT written to collection_redirects, because that table
 * points at a collection and these destinations are not collections; they are
 * hard-coded in next.config.ts instead, the way the system and camera slug
 * redirects already are.
 */

import { createPool } from "./lib/db.mjs";
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

// { collection slug, kind, target slug, createTarget? }
const MOVES = [
  // ── Manufacturer product lines → lens_series ───────────────────────
  { from: "canon-l-series-lenses", kind: "series", to: "canon-l" },
  { from: "pentax-star-lenses", kind: "series", to: "pentax-star" },
  { from: "sigma-ys-lenses", kind: "series", to: "sigma-xq-ys" },
  { from: "tamron-f-system-lenses", kind: "series", to: "tamron-f" },
  {
    from: "sigma-global-vision",
    kind: "series",
    to: "sigma-global-vision",
    create: { name: "Sigma Global Vision" },
  },

  // ── Mounts and adapter systems → systems ───────────────────────────
  { from: "t-mount-lenses", kind: "system", to: "t-mount-t2" },
  { from: "tamron-adaptall-2-lenses", kind: "system", to: "tamron-adaptall-2" },
  { from: "tamron-adaptall-lenses", kind: "system", to: "tamron-adaptall" },
  { from: "tamron-adapt-a-matic-lenses", kind: "system", to: "tamron-adapt-a-matic" },
  {
    from: "komura-unidapter",
    kind: "system",
    to: "komura-unidapter",
    create: { name: "Komura Unidapter", manufacturer: "Komura" },
  },
];

const pool = createPool(process.env.DATABASE_URL, { max: 1 });
const client = await pool.connect();
const sql = (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return client.query(text, values).then((r) => r.rows);
};

try {
  const collections = new Map((await sql`select id, slug, name, description from collections`).map((r) => [r.slug, r]));
  const series = new Map((await sql`select id, slug, name from lens_series`).map((r) => [r.slug, r]));
  const systems = new Map((await sql`select id, slug, name from systems`).map((r) => [r.slug, r]));

  const problems = [];
  for (const m of MOVES) {
    if (!collections.has(m.from)) continue; // already moved by an earlier run
    const target = m.kind === "series" ? series.get(m.to) : systems.get(m.to);
    if (!target && !m.create) problems.push(`${m.from}: ${m.kind} "${m.to}" does not exist and no create block is given`);
    if (target && m.create) problems.push(`${m.from}: ${m.kind} "${m.to}" already exists, but a create block is given`);
  }
  if (problems.length) {
    console.error("Refusing to run — the database does not match the plan:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const [{ n: before }] = await sql`select count(*)::int as n from collections`;
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${MOVES.length} moves`);
  console.log(`collections before: ${before}\n`);

  await client.query("BEGIN");
  let created = 0;
  let attached = 0;
  let removed = 0;

  for (const m of MOVES) {
    const coll = collections.get(m.from);
    if (!coll) {
      console.log(`→ ${m.from}  [already moved]\n`);
      continue;
    }

    let targetId;
    if (m.create) {
      const cols = m.kind === "series" ? "name, slug, description" : "name, slug, manufacturer";
      const vals =
        m.kind === "series"
          ? [m.create.name, m.to, coll.description]
          : [m.create.name, m.to, m.create.manufacturer ?? null];
      const [row] = await client
        .query(`insert into ${m.kind === "series" ? "lens_series" : "systems"} (${cols}) values ($1,$2,$3) returning id`, vals)
        .then((r) => r.rows);
      targetId = row.id;
      created += 1;
      console.log(`→ ${m.from}`);
      console.log(`    created ${m.kind} "${m.create.name}" (${m.to})`);
    } else {
      targetId = (m.kind === "series" ? series : systems).get(m.to).id;
      console.log(`→ ${m.from}`);
    }

    // Attach any member the destination does not already carry.
    const link =
      m.kind === "series"
        ? `insert into lens_series_memberships (lens_id, series_id)
           select lc.lens_id, $1 from lens_collections lc
           join lenses l on l.id = lc.lens_id and l.merged_into_id is null
           where lc.collection_id = $2 on conflict do nothing`
        : `insert into lens_systems (lens_id, system_id)
           select lc.lens_id, $1 from lens_collections lc
           join lenses l on l.id = lc.lens_id and l.merged_into_id is null
           where lc.collection_id = $2 on conflict do nothing`;
    const linked = await client.query(link, [targetId, coll.id]);
    attached += linked.rowCount ?? 0;

    const [{ n: members }] = await sql`
      select count(l.id)::int as n from lens_collections lc
      join lenses l on l.id = lc.lens_id and l.merged_into_id is null
      where lc.collection_id = ${coll.id}`;
    const [{ n: targetSize }] =
      m.kind === "series"
        ? await sql`select count(*)::int as n from lens_series_memberships where series_id = ${targetId}`
        : await sql`select count(*)::int as n from lens_systems where system_id = ${targetId}`;

    // The collection's own slug redirect rows cascade away with it, so any
    // slug that already redirected here must be re-homed in next.config.ts.
    const inbound = await sql`select old_slug from collection_redirects where collection_id = ${coll.id}`;

    await client.query(`delete from collections where id = $1`, [coll.id]);
    removed += 1;

    const path = m.kind === "series" ? `/lenses/series/${m.to}` : `/systems/${m.to}`;
    console.log(`    ${members} members, ${linked.rowCount} newly attached; ${m.kind} now holds ${targetSize}`);
    console.log(`    redirect: /collections/${m.from} -> ${path}`);
    for (const r of inbound) console.log(`    redirect: /collections/${r.old_slug} -> ${path}   (was a collection redirect)`);
    console.log();
  }

  const [{ n: after }] = await sql`select count(*)::int as n from collections`;
  console.log(`collections after: ${after} (was ${before}, removed ${removed}, created ${created} destination rows)`);
  console.log(`memberships attached to destinations: ${attached}`);

  if (apply) {
    await client.query("COMMIT");
    console.log("\nCOMMITTED — now add the redirects above to next.config.ts");
  } else {
    await client.query("ROLLBACK");
    console.log("\nDRY RUN — rolled back, nothing changed. Re-run with --apply to write.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
