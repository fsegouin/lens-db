/**
 * Collection consolidation.
 *
 * The `collections` table was imported from lens-db.com in one batch, and the
 * source carried two naming conventions for the same nine collections: one
 * suffixes "-lenses" and spells a macro ratio out, the other does neither. So
 * the site ships nine pairs of near-duplicate collections, three of which have
 * byte-identical display names and sit next to each other on the index looking
 * like a rendering bug.
 *
 * This merges each pair into one: memberships move, redirects already pointing
 * at the loser are re-pointed, revisions and reports follow, a
 * `collection_redirects` row keeps the old URL alive, and the loser is
 * deleted. Everything runs in one transaction.
 *
 * It also deletes three collections that hold no lenses at all.
 *
 * Usage (from frontend/):
 *   node scripts/consolidate-collections.mjs            # dry run
 *   node scripts/consolidate-collections.mjs --apply    # write
 *
 * Every collection is pinned by id AND slug AND name; a mismatch aborts before
 * any write. Requires the `collection_redirects` table (migration 0054) and
 * DATABASE_URL.
 *
 * The statement sequence here mirrors POST /api/admin/collections/[id]/merge,
 * which is the same operation for one pair from the admin UI. If you change
 * the ordering rules below, change them there too: the comments in that route
 * explain why each step sits where it does.
 *
 * WHICH SIDE SURVIVES
 *
 * Not the larger one. `tamron-adaptall` has 22 lenses against its survivor's
 * 21, and `macro2` has 95 against 94, because the two imports simply caught
 * different subsets. The survivor is the row with the well-formed slug and,
 * where either has usable prose, the description that survives
 * cleanCollectionDescription. Lenses the loser holds and the survivor does not
 * are migrated, so nothing is lost by picking the smaller side.
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

// ─── Merge map ──────────────────────────────────────────────────────────
// { into: [id, slug, name], from: [id, slug, name], why }

const MERGES = [
  {
    into: [8, "fisheye-lenses", "Fisheye lenses"],
    from: [9, "fisheyes", "Fisheye lenses"],
    why: "Identical display names. 8 carries the only description that survives sanitising; 9's slug does not slugify its own name.",
  },
  {
    into: [18, "macro-1-1", "Macro 1:1"],
    from: [21, "macro", "Macro 1:1"],
    why: "Identical display names. Neither description survives, so the slug decides: 'macro' is meaningless for a collection named Macro 1:1.",
  },
  {
    into: [19, "macro-1-2", "Macro 1:2"],
    from: [22, "macro2", "Macro 1:2"],
    why: "Identical display names. 'macro2' is the only slug in the table disambiguated with a bare digit.",
  },
  {
    into: [15, "leica-m-special-limited-editions", "Leica M special limited editions"],
    from: [14, "leica-m-limited-special-editions", "Leica M limited special editions"],
    why: "Word-order variant. Nine other collections use 'special limited editions'; only these two Leica ones invert it.",
  },
  {
    into: [17, "leica-r-special-limited-editions", "Leica R special limited editions"],
    from: [16, "leica-r-limited-special-editions", "Leica R limited special editions"],
    why: "Same word-order variant as the Leica M pair.",
  },
  {
    into: [45, "tamron-adaptall-2-lenses", "Tamron Adaptall-2 lenses"],
    from: [46, "tamron-adaptall-2", "Tamron Adaptall-2"],
    why: "45 has surviving prose, 46 has none.",
  },
  {
    into: [47, "tamron-adaptall-lenses", "Tamron Adaptall lenses"],
    from: [48, "tamron-adaptall", "Tamron Adaptall"],
    why: "48 is the larger side (22 against 21) but has no description; 47 has the only usable one. The two extra lenses migrate.",
  },
  {
    into: [43, "tamron-adapt-a-matic-lenses", "Tamron Adapt-A-Matic lenses"],
    from: [44, "tamron-adapt-a-matic", "Tamron Adapt-A-Matic"],
    why: "Equal size; 43 has the surviving description.",
  },
  {
    into: [25, "nifty-forties", "Nifty forties"],
    from: [26, "nifty-fourties", "Nifty fourties"],
    why: "'Fourties' is a misspelling.",
  },
];

// ─── Deletions ──────────────────────────────────────────────────────────
// Collections holding no live lens. They are already hidden from the index
// (it filters count > 0) and, since the sitemap was aligned with it, are
// advertised nowhere and linked from nothing, so no redirect is warranted.
//
// `same-optical-design` is deliberately NOT here. It holds 40 lenses and its
// premise is broken rather than empty: "same optical design" is a relation
// between two lenses and the page never says which two. Deleting it is a
// judgement call about the data, not cleanup, so it is left for a person.

const DELETES = [
  [33, "retro-styled-lenses", "Retro-styled lenses", "Empty, and no description to salvage."],
  [27, "nikon-large-format-lenses", "Nikon large-format lenses", "Empty, and no description to salvage."],
  [
    34,
    "ricoh-rikenon-lenses",
    "Ricoh (Auto) Rikenon M42 lenses",
    "Empty. Its description promises 'a full list' and lists nothing; the 214 characters that survive sanitising are worth carrying to a Ricoh series row when product lines move there.",
  ],
];

// ─── Main ───────────────────────────────────────────────────────────────

const pool = createPool(process.env.DATABASE_URL, { max: 1 });
const client = await pool.connect();
const sql = (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return client.query(text, values).then((r) => r.rows);
};

const liveCount = async (id) =>
  (
    await sql`select count(l.id)::int as n from lens_collections lc
              join lenses l on l.id = lc.lens_id and l.merged_into_id is null
              where lc.collection_id = ${id}`
  )[0].n;

try {
  const [{ exists }] = await sql`select to_regclass('public.collection_redirects') is not null as exists`;
  if (!exists) {
    console.error("collection_redirects table is missing — apply migration 0054 first (pnpm db:migrate).");
    process.exit(1);
  }

  const rows = await sql`select id, slug, name from collections`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Validate every pinned id/slug/name before touching anything.
  const problems = [];
  const seen = new Set();
  const check = (triple, role) => {
    const [id, slug, name] = triple;
    const row = byId.get(id);
    if (!row) return false; // already gone: an earlier run did this one
    if (row.slug !== slug) problems.push(`${role} ${id} has slug "${row.slug}", expected "${slug}"`);
    if (row.name !== name) problems.push(`${role} ${id} is named "${row.name}", expected "${name}"`);
    if (seen.has(id)) problems.push(`collection ${id} appears twice in the plan`);
    seen.add(id);
    return true;
  };
  for (const m of MERGES) {
    check(m.into, "target");
    check(m.from, "source");
    if (m.into[0] === m.from[0]) problems.push(`collection ${m.into[0]} is its own source`);
  }
  for (const d of DELETES) check(d.slice(0, 3), "delete");
  for (const m of MERGES) {
    if (DELETES.some((d) => d[0] === m.into[0])) problems.push(`collection ${m.into[0]} is both a merge target and a delete`);
  }

  if (problems.length) {
    console.error("Refusing to run — the database does not match the plan:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const before = rows.length;
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${MERGES.length} merges, ${DELETES.length} deletions`);
  console.log(`collections before: ${before}\n`);

  let migrated = 0;
  let removed = 0;

  await client.query("BEGIN");

  for (const m of MERGES) {
    const [intoId, intoSlug] = m.into;
    const [fromId, fromSlug] = m.from;
    if (!byId.get(fromId)) {
      console.log(`→ ${intoSlug}\n    ← ${fromSlug}  [already merged]\n`);
      continue;
    }

    const keepBefore = await liveCount(intoId);
    const loseBefore = await liveCount(fromId);
    const [{ n: toMigrate }] = await sql`
      select count(*)::int as n from lens_collections a
      join lenses l on l.id = a.lens_id and l.merged_into_id is null
      where a.collection_id = ${fromId}
        and not exists (select 1 from lens_collections b
                        where b.collection_id = ${intoId} and b.lens_id = a.lens_id)`;

    // Same order as the merge route, and for the same reasons.
    const moved = await client.query(
      `insert into lens_collections (lens_id, collection_id)
       select lens_id, $1 from lens_collections where collection_id = $2
       on conflict do nothing`,
      [intoId, fromId]
    );
    await client.query(`update collection_redirects set collection_id = $1 where collection_id = $2`, [intoId, fromId]);
    await client.query(
      `insert into collection_redirects (old_slug, collection_id) values ($1, $2)
       on conflict (old_slug) do update set collection_id = $2`,
      [fromSlug, intoId]
    );
    await client.query(
      `update revisions set
         entity_id = $1,
         revision_number = revision_number + coalesce(
           (select max(revision_number) from revisions where entity_type='collection' and entity_id = $1), 0),
         data = jsonb_set(jsonb_set(jsonb_set(data, '{id}', to_jsonb($1::int)),
                  '{slug}', to_jsonb($3::text)), '{name}', to_jsonb($4::text))
       where entity_type = 'collection' and entity_id = $2`,
      [intoId, fromId, m.into[1], m.into[2]]
    );
    const rejected = await client.query(
      `update pending_edits set status='rejected', reject_reason=$2, reviewed_at=now()
       where entity_type='collection' and entity_id=$1 and status='pending'`,
      [fromId, `Collection "${m.from[2]}" was merged into "${m.into[2]}"`]
    );
    await client.query(`update pending_edits set entity_id=$1 where entity_type='collection' and entity_id=$2`, [intoId, fromId]);
    await client.query(
      `update issue_reports set entity_id=$1, entity_slug=$3, entity_name=$4
       where entity_type='collection' and entity_id=$2`,
      [intoId, fromId, m.into[1], m.into[2]]
    );
    await client.query(`delete from collections where id = $1`, [fromId]);

    const keepAfter = await liveCount(intoId);
    migrated += toMigrate;
    removed += 1;

    console.log(`→ #${intoId} ${intoSlug}  (${keepBefore} lenses)`);
    console.log(`    ← #${fromId} ${fromSlug}  (${loseBefore} lenses, ${toMigrate} not already in the target)`);
    console.log(`    ${m.why}`);
    console.log(`    result: ${keepAfter} lenses, ${moved.rowCount} membership rows written, ${rejected.rowCount} pending edit(s) rejected`);
    console.log(`    /collections/${fromSlug} now redirects to /collections/${intoSlug}\n`);
  }

  for (const [id, slug, , why] of DELETES) {
    if (!byId.get(id)) {
      console.log(`✕ ${slug}  [already deleted]\n`);
      continue;
    }
    const n = await liveCount(id);
    if (n > 0) {
      console.error(`Refusing to delete ${slug}: it holds ${n} live lenses, which the plan says it should not.`);
      await client.query("ROLLBACK");
      process.exit(1);
    }
    await client.query(`delete from collections where id = $1`, [id]);
    removed += 1;
    console.log(`✕ #${id} ${slug}  (0 lenses)`);
    console.log(`    ${why}\n`);
  }

  const [{ n: after }] = await sql`select count(*)::int as n from collections`;
  const [{ n: dupeNames }] = await sql`
    select count(*)::int as n from (select name from collections group by name having count(*) > 1) d`;
  const [{ n: redirects }] = await sql`select count(*)::int as n from collection_redirects`;

  console.log(`collections after: ${after} (was ${before}, removed ${removed})`);
  console.log(`memberships migrated: ${migrated}`);
  console.log(`collection_redirects rows: ${redirects}`);
  console.log(`collections still sharing a name: ${dupeNames}${dupeNames === 0 ? "  (the unique constraint can now be added)" : ""}`);

  if (apply) {
    await client.query("COMMIT");
    console.log("\nCOMMITTED");
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
