/**
 * Apply verified camera merges and renames from a JSON map.
 *
 * Each entry names a keeper by id and name. With `mergeId`/`mergeName` the
 * loser is merged into it the way the admin duplicates queue does: fields the
 * keeper lacks come across, compatibility rows, ratings, kit entries and
 * recorded sales move, the loser's estimate is dropped, `merged_into_id` is
 * set so the loser's URL keeps resolving, the loser gets a patrolled
 * revision and so does the keeper. `name` renames the keeper, `alias` records
 * the other names it was sold under and `yearIntroduced` fills the year only
 * where the keeper has none; all three are applied whether or not there is a
 * loser. Every id
 * is pinned by name and any mismatch aborts before a single write.
 *
 * Usage (from frontend/):
 *   node scripts/merge-cameras.mjs scripts/camera-merges.2026-09-15.json          # dry run
 *   node scripts/merge-cameras.mjs scripts/camera-merges.2026-09-15.json --apply
 *
 * After applying, recompute the keepers' prices and refresh the pages:
 *   GET /api/cron/recompute-prices?entityType=camera&ids=... then
 *   POST /api/cron/revalidate with {"tags":["cameras"]} (names and merges touch every list).
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

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
if (!file) {
  console.error("usage: node scripts/merge-cameras.mjs <map.json> [--apply]");
  process.exit(2);
}
const entries = JSON.parse(readFileSync(resolve(file), "utf8"));

// Scalar columns the keeper takes from the loser only where it has nothing.
const FILL_COLUMNS = [
  "description", "url", "system_id", "built_in_lens_id", "body_type", "shutter_type",
  "sensor_type", "sensor_size", "megapixels", "resolution", "year_introduced",
  "year_discontinued", "production_status", "weight_g",
];

const sql = createSql();
try {
  const ids = [...new Set(entries.flatMap((e) => [e.keepId, e.mergeId].filter(Boolean)))];
  const rows = await sql`select * from cameras where id = any(${ids}::int[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const problems = [];
  for (const e of entries) {
    const keeper = byId.get(e.keepId);
    if (!keeper) problems.push(`keeper #${e.keepId} not found`);
    else if (keeper.name !== e.keepName) problems.push(`keeper #${e.keepId} is "${keeper.name}", map says "${e.keepName}"`);
    else if (keeper.merged_into_id != null) problems.push(`keeper #${e.keepId} is itself merged into #${keeper.merged_into_id}`);
    if (!e.source) problems.push(`keeper #${e.keepId} has no source`);
    if (e.mergeId === e.keepId) problems.push(`#${e.mergeId} merges into itself`);
    if (e.mergeId) {
      const loser = byId.get(e.mergeId);
      if (!loser) problems.push(`loser #${e.mergeId} not found`);
      else if (loser.name !== e.mergeName) problems.push(`loser #${e.mergeId} is "${loser.name}", map says "${e.mergeName}"`);
      else if (loser.merged_into_id != null) problems.push(`loser #${e.mergeId} already merged into #${loser.merged_into_id}`);
    }
  }
  if (problems.length) {
    console.error("Refusing to write:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  for (const e of entries) {
    const keeper = byId.get(e.keepId);
    const parts = [`#${e.keepId} ${e.keepName}`];
    if (e.name && e.name !== keeper.name) parts.push(`rename -> "${e.name}"`);
    if (e.alias) parts.push(`alias "${e.alias}"`);
    if (e.mergeId) parts.push(`<- merge #${e.mergeId} ${e.mergeName}`);
    console.log(parts.join("  "));
  }

  if (!apply) {
    console.log(`\nDry run: ${entries.length} entries. Re-run with --apply to write.`);
  } else {
    const snapshotOf = (row) => {
      const snapshot = {};
      for (const [k, v] of Object.entries(row)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      return snapshot;
    };
    const revise = async (id, summary, changed) => {
      const [full] = await sql`select * from cameras where id = ${id}`;
      const [{ next }] =
        await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'camera' and entity_id = ${id}`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                values ('camera', ${id}, ${next}, ${JSON.stringify(snapshotOf(full))}::jsonb, ${summary}, ${JSON.stringify(changed)}::jsonb, true)`;
    };

    for (const e of entries) {
      const changed = [];
      if (e.mergeId) {
        const [keeper] = await sql`select * from cameras where id = ${e.keepId}`;
        const [loser] = await sql`select * from cameras where id = ${e.mergeId}`;
        const taken = [];
        for (const col of FILL_COLUMNS) {
          const empty = keeper[col] == null || keeper[col] === "";
          const has = loser[col] != null && loser[col] !== "";
          if (empty && has) {
            await sql.query(`update cameras set ${col} = $1 where id = $2`, [loser[col], e.keepId]);
            taken.push(col.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
          }
        }
        // Spec keys the keeper lacks come across too, each as its own
        // "specs.<Key>" field so its citation can follow.
        const keeperSpecs = keeper.specs && typeof keeper.specs === "object" ? keeper.specs : {};
        const loserSpecs = loser.specs && typeof loser.specs === "object" ? loser.specs : {};
        const newSpecs = Object.fromEntries(Object.entries(loserSpecs).filter(([k, v]) => v != null && v !== "" && (keeperSpecs[k] == null || keeperSpecs[k] === "")));
        if (Object.keys(newSpecs).length) {
          await sql`update cameras set specs = ${JSON.stringify({ ...newSpecs, ...keeperSpecs })}::jsonb where id = ${e.keepId}`;
          taken.push(...Object.keys(newSpecs).map((k) => `specs.${k}`));
        }
        const keeperImages = Array.isArray(keeper.images) ? keeper.images : [];
        const loserImages = Array.isArray(loser.images) ? loser.images : [];
        const have = new Set(keeperImages.map((i) => i.src));
        const fresh = loserImages.filter((i) => i?.src && !have.has(i.src));
        if (fresh.length) {
          await sql`update cameras set images = ${JSON.stringify([...keeperImages, ...fresh])}::jsonb where id = ${e.keepId}`;
          taken.push("images");
        }
        if (taken.length) {
          await sql`insert into field_citations (entity_type, entity_id, field, source_name, source_url, retrieved_at, note)
                    select entity_type, ${e.keepId}, field, source_name, source_url, retrieved_at, note
                    from field_citations where entity_type = 'camera' and entity_id = ${e.mergeId} and field = any(${taken}::text[])
                    on conflict (entity_type, entity_id, field) do nothing`;
        }
        await sql`insert into lens_compatibility (lens_id, camera_id, is_native, notes)
                  select lens_id, ${e.keepId}, is_native, notes from lens_compatibility where camera_id = ${e.mergeId} on conflict do nothing`;
        const moved = await sql`insert into camera_ratings (camera_id, ip_hash, rating, created_at)
                  select ${e.keepId}, ip_hash, rating, created_at from camera_ratings where camera_id = ${e.mergeId} on conflict do nothing returning id`;
        if (moved.length) {
          await sql`update cameras set average_rating = s.avg, rating_count = s.n
                    from (select avg(rating)::real as avg, count(*)::int as n from camera_ratings where camera_id = ${e.keepId}) s
                    where id = ${e.keepId}`;
        }
        await sql`update kit_items k set entity_id = ${e.keepId}, updated_at = now()
                  where k.entity_type = 'camera' and k.entity_id = ${e.mergeId}
                    and not exists (select 1 from kit_items o where o.user_id = k.user_id and o.entity_type = 'camera' and o.entity_id = ${e.keepId})`;
        // Recorded sales follow the product. A sale both rows already knew
        // (same listing url) stays once, on the keeper.
        await sql`update price_history h set entity_id = ${e.keepId}
                  where h.entity_type = 'camera' and h.entity_id = ${e.mergeId}
                    and (h.source_url is null or not exists (select 1 from price_history o
                      where o.entity_type = 'camera' and o.entity_id = ${e.keepId} and o.source_url = h.source_url))`;
        await sql`delete from price_history where entity_type = 'camera' and entity_id = ${e.mergeId}`;
        await sql`delete from price_estimates where entity_type = 'camera' and entity_id = ${e.mergeId}`;
        await sql`update cameras set merged_into_id = ${e.keepId} where id = ${e.mergeId}`;
        await sql`update cameras set merged_into_id = ${e.keepId} where merged_into_id = ${e.mergeId}`;
        await revise(e.mergeId, `Merged into "${e.name ?? e.keepName}" (#${e.keepId}) as the same camera under another market name (${e.source})`, ["mergedIntoId"]);
        changed.push(...taken);
        console.log(`  merged #${e.mergeId} into #${e.keepId}${taken.length ? ` taking ${taken.join(", ")}` : ""}`);
      }
      const sets = [];
      if (e.name && e.name !== e.keepName) { await sql`update cameras set name = ${e.name} where id = ${e.keepId}`; sets.push("name"); }
      if (e.alias) { await sql`update cameras set alias = ${e.alias} where id = ${e.keepId}`; sets.push("alias"); }
      if (e.yearIntroduced) {
        const [{ year_introduced }] = await sql`select year_introduced from cameras where id = ${e.keepId}`;
        if (year_introduced == null) { await sql`update cameras set year_introduced = ${e.yearIntroduced} where id = ${e.keepId}`; sets.push("yearIntroduced"); }
      }
      changed.push(...sets);
      if (changed.length || e.mergeId) {
        await revise(e.keepId, e.mergeId
          ? `Absorbed "${e.mergeName}" (#${e.mergeId}), the same camera under another market name; ${sets.length ? sets.join(", ") + " set" : "no fields changed"} (${e.source})`
          : `${sets.join(", ")} set: international name kept, market names recorded as alias (${e.source})`, changed);
      }
    }
    console.log(`\nDone. ${entries.length} entries applied.`);
  }
} finally {
  await sql.end();
}
