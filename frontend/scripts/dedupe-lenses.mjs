/**
 * Merge lens rows that are the same lens written twice.
 *
 * The catalogue was assembled from two sources with two naming conventions:
 * lens-db.com wrote "Canon EF 100mm F/2 USM" with a year-suffixed slug, the
 * DPReview import wrote "Canon EF 100mm f/2.0 USM" with a bare one. Every
 * such pair shows a lens twice in lists and splits its ratings, prices and
 * memberships across two pages.
 *
 * A pair is a duplicate when brand, focal length and maximum aperture are
 * equal and the names are equal once punctuation, case and a trailing ".0"
 * are ignored. "MC" is never stripped: it is a Minolta generation marker, not
 * a coating note. A pair is left alone, and listed, when the rows disagree on
 * anything measured: introduction years more than a year apart, a different
 * element count, weights more than 12% apart, close focus more than 10%
 * apart. Those may be genuine versions (Leica reissues carry identical names).
 *
 * The keeper is the row with the year-suffixed slug, the site's convention;
 * if neither or both have one, the richer row. Before the loser is retired,
 * everything only it has is moved or copied onto the keeper: memberships in
 * collections, series, tags, mounts and compatibility; ratings from IPs the
 * keeper has not seen; empty spec columns and spec keys; images; and the
 * description when the keeper's is empty or a stub. Price history stays where
 * it is (per listing, would double-count). The merge itself is soft:
 * merged_into_id makes the old slug a redirect, as the admin queue does.
 *
 * Usage (from frontend/):
 *   node scripts/dedupe-lenses.mjs                 # dry run: pairs, skips, what would move
 *   node scripts/dedupe-lenses.mjs --apply         # write, with a revision on both rows
 *   node scripts/dedupe-lenses.mjs --only 123,456  # restrict to these loser ids
 *   node scripts/dedupe-lenses.mjs --trust 123,456 # merge these ids despite a measured disagreement
 *   node scripts/dedupe-lenses.mjs --pairs verdicts.jsonl --min-confidence 0.95   # pairs judged by judge-lens-duplicates.mjs
 */

import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, appendFileSync } from "fs";
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
const apply = args.includes("--apply");
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",").map(Number)) : null;
// Rows whose measured disagreement a person has checked and found to be one
// copy's bad data rather than a second version.
const trust = new Set(args.includes("--trust") ? args[args.indexOf("--trust") + 1].split(",").map(Number) : []);
// A verdicts file from judge-lens-duplicates.mjs replaces the name rule: every
// "duplicate" verdict at or above --min-confidence becomes a pair, its keeper
// chosen as below unless the verdict named one.
const pairsFile = args.includes("--pairs") ? args[args.indexOf("--pairs") + 1] : null;
const minConfidence = parseFloat(args.includes("--min-confidence") ? args[args.indexOf("--min-confidence") + 1] : "0.95");

/** Names equal under this are the same name written two ways. */
function normName(name) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[–—‑]/g, "-")
    .replace(/f\/\s*/g, "f")
    .replace(/(\d)\.0(?!\d)/g, "$1")
    // A maker's model code in brackets ("[SEL15F14G]") names the same lens.
    .replace(/[[(]\s*[a-z]{2,4}\d{2,}[a-z0-9]*\s*[\])]/g, "")
    .replace(/\(([^)]*)\)/g, "$1")
    .replace(/[^a-z0-9]+/g, "");
}

const SPEC_COLUMNS = [
  "weight_g", "filter_size_mm", "min_focus_distance_m", "max_magnification", "lens_elements", "lens_groups",
  "diaphragm_blades", "year_introduced", "year_discontinued", "coverage", "lens_type", "era", "production_status",
  "url", "system_id", "version_group_id", "version_label",
];

function richness(l) {
  let n = 0;
  for (const c of SPEC_COLUMNS) if (l[c] != null) n += 1;
  n += Math.min(3, Math.floor((l.description?.length ?? 0) / 300));
  n += Math.min(2, (l.images ?? []).length);
  n += Object.keys(l.specs ?? {}).length > 5 ? 1 : 0;
  return n;
}

const sql = createSql();
try {
  const rows = await sql`
    select l.*, (select count(*)::int from lens_ratings r where r.lens_id = l.id) as n_ratings
    from lenses l where l.merged_into_id is null`;

  const groups = new Map();
  for (const l of rows) {
    const key = [
      (l.brand ?? "").toLowerCase(),
      Number(l.focal_length_min), Number(l.focal_length_max ?? l.focal_length_min), Number(l.aperture_min),
      normName(l.name),
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  const pairs = [];
  const skipped = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const judged = pairsFile
    ? readFileSync(resolve(pairsFile), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
        .filter((v) => v.relationship === "duplicate" && v.confidence >= minConfidence)
        .map((v) => [byId.get(v.a.id), byId.get(v.b.id), v])
        .filter(([a, b]) => a && b)
    : null;
  const groupsToWalk = judged ? judged.map(([a, b, v]) => Object.assign([a, b], { verdict: v })) : [...groups.values()];
  for (const group of groupsToWalk) {
    if (group.length < 2) continue;
    if (group.length > 2) {
      skipped.push({ rows: group, why: `${group.length} rows share the name; needs a person` });
      continue;
    }
    const [a, b] = group;
    const reasons = [];
    // Same name on two mounts can be one lens sold twice (Meyer Primagon for
    // Exakta and for Altix) or two lenses (Mamiya Sekor 180mm for the RB67
    // and for the C-series TLR); a person decides, with --trust.
    if ((a.system_id || b.system_id) && a.system_id !== b.system_id) reasons.push(`mounts ${a.system_id ?? "none"} vs ${b.system_id ?? "none"}`);
    if (a.year_introduced && b.year_introduced && Math.abs(a.year_introduced - b.year_introduced) > 1) reasons.push(`years ${a.year_introduced} vs ${b.year_introduced}`);
    if (a.lens_elements && b.lens_elements && a.lens_elements !== b.lens_elements) reasons.push(`elements ${a.lens_elements} vs ${b.lens_elements}`);
    if (a.weight_g && b.weight_g && Math.abs(a.weight_g - b.weight_g) / Math.max(a.weight_g, b.weight_g) > 0.12) reasons.push(`weight ${a.weight_g}g vs ${b.weight_g}g`);
    if (a.min_focus_distance_m && b.min_focus_distance_m && Math.abs(a.min_focus_distance_m - b.min_focus_distance_m) / Math.max(a.min_focus_distance_m, b.min_focus_distance_m) > 0.1) reasons.push(`close focus ${a.min_focus_distance_m} vs ${b.min_focus_distance_m}`);
    // A judged pair has had its disagreements read; the guards are advisory there.
    if (reasons.length && !group.verdict && !(trust.has(a.id) || trust.has(b.id))) {
      skipped.push({ rows: group, why: reasons.join(", ") });
      continue;
    }
    const yearSlug = (l) => /-\d{4}(-\d)?$/.test(l.slug);
    let keep, drop;
    if (group.verdict?.keeper === "A") [keep, drop] = [a, b];
    else if (group.verdict?.keeper === "B") [keep, drop] = [b, a];
    else if (yearSlug(a) !== yearSlug(b)) [keep, drop] = yearSlug(a) ? [a, b] : [b, a];
    else if (richness(a) !== richness(b)) [keep, drop] = richness(a) > richness(b) ? [a, b] : [b, a];
    else [keep, drop] = a.id < b.id ? [a, b] : [b, a];
    if (only && !only.has(drop.id)) continue;
    pairs.push({ keep, drop, verdict: group.verdict ?? null });
  }
  const verdictOf = new Map(pairs.filter((p) => p.verdict).map((p) => [p.drop.id, `${p.verdict.confidence}: ${p.verdict.reasoning.replace(/\s+/g, " ").slice(0, 200)}`]));

  console.log(`${rows.length} live lenses; ${pairs.length} duplicate pairs to merge, ${skipped.length} groups left alone\n`);
  for (const { keep, drop } of pairs) {
    console.log(`  keep #${keep.id} ${keep.name} [${keep.slug}]`);
    console.log(`  drop #${drop.id} ${drop.name} [${drop.slug}]`);
    if (verdictOf.get(drop.id)) console.log(`       ${verdictOf.get(drop.id)}`);
  }
  if (skipped.length) {
    console.log(`\nLeft alone:`);
    for (const s of skipped) console.log(`  ${s.rows.map((r) => `#${r.id} ${r.name} (${r.year_introduced ?? "?"})`).join("  <>  ")}\n      ${s.why}`);
  }
  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to write.`);
    process.exit(0);
  }

  const backupPath = `${process.env.HOME}/Work/lens-db-dedupe-before-${new Date().toISOString().slice(0, 10)}.jsonl`;
  const touchedPaths = [];

  async function revision(id, summary, changed) {
    const [full] = await sql`select * from lenses where id = ${id}`;
    const snapshot = {};
    for (const [k, v] of Object.entries(full)) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
    }
    const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'lens' and entity_id = ${id}`;
    await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled, patrolled_at)
              values ('lens', ${id}, ${next}, ${JSON.stringify(snapshot)}::jsonb, ${summary}, ${JSON.stringify(changed)}::jsonb, true, now())`;
  }

  const group_summary = (keep, drop) => {
    const v = pairs.find((p) => p.drop.id === drop.id)?.verdict;
    return v
      ? `Merged into "${keep.name}" (#${keep.id}) as the same lens: ${v.reasoning.replace(/\s+/g, " ").slice(0, 300)}`
      : `Merged into "${keep.name}" (#${keep.id}) as the same lens written twice`;
  };
  // Three rows of one lens arrive as three pairs. Once a row is retired it
  // takes no further part; a second run picks up what was skipped.
  const retired = new Set();
  let merged = 0;
  for (const { keep, drop } of pairs) {
    if (retired.has(drop.id) || retired.has(keep.id)) {
      console.log(`  skipped #${drop.id} → #${keep.id}: a row in this pair was retired earlier in the run`);
      continue;
    }
    retired.add(drop.id);
    merged += 1;
    appendFileSync(backupPath, JSON.stringify({ keep, drop }) + "\n");

    // 1. Fold what only the loser has onto the keeper.
    const set = {};
    for (const c of SPEC_COLUMNS) if (keep[c] == null && drop[c] != null) set[c] = drop[c];
    const specs = { ...(drop.specs ?? {}), ...(keep.specs ?? {}) };
    if (Object.keys(specs).length > Object.keys(keep.specs ?? {}).length) set.specs = specs;
    const keepSrcs = new Set((keep.images ?? []).map((i) => i.src));
    const extraImages = (drop.images ?? []).filter((i) => !keepSrcs.has(i.src));
    if (extraImages.length) set.images = [...(keep.images ?? []), ...extraImages];
    const keepDesc = keep.description?.trim() ?? "";
    const dropDesc = drop.description?.trim() ?? "";
    if (dropDesc && (keepDesc.length < 200 && dropDesc.length > keepDesc.length)) set.description = dropDesc;
    const changed = Object.keys(set).map((k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
    if (changed.length) {
      // Column names come from SPEC_COLUMNS and two literals, never from data.
      const cols = Object.keys(set);
      const text = `update lenses set ${cols.map((c, i) => `${c} = $${i + 1}${typeof set[c] === "object" ? "::jsonb" : ""}`).join(", ")} where id = $${cols.length + 1}`;
      await sql.query(text, [...cols.map((c) => (typeof set[c] === "object" ? JSON.stringify(set[c]) : set[c])), keep.id]);
    }

    // 2. Memberships the loser has and the keeper lacks.
    await sql`insert into lens_collections (lens_id, collection_id) select ${keep.id}, collection_id from lens_collections where lens_id = ${drop.id} on conflict do nothing`;
    await sql`insert into lens_series_memberships (lens_id, series_id) select ${keep.id}, series_id from lens_series_memberships where lens_id = ${drop.id} on conflict do nothing`;
    await sql`insert into lens_tags (lens_id, tag_id) select ${keep.id}, tag_id from lens_tags where lens_id = ${drop.id} on conflict do nothing`;
    await sql`insert into lens_systems (lens_id, system_id) select ${keep.id}, system_id from lens_systems where lens_id = ${drop.id} on conflict do nothing`;
    await sql`insert into lens_compatibility (lens_id, camera_id, is_native) select ${keep.id}, camera_id, is_native from lens_compatibility where lens_id = ${drop.id} on conflict do nothing`;
    const moved = await sql`insert into lens_ratings (lens_id, ip_hash, rating, created_at)
      select ${keep.id}, ip_hash, rating, created_at from lens_ratings where lens_id = ${drop.id} on conflict do nothing returning id`;
    if (moved.length) {
      await sql`update lenses set average_rating = s.avg, rating_count = s.n
                from (select avg(rating)::real as avg, count(*)::int as n from lens_ratings where lens_id = ${keep.id}) s
                where id = ${keep.id}`;
    }

    // 3. Retire the loser.
    await sql`update lenses set merged_into_id = ${keep.id} where id = ${drop.id} and merged_into_id is null`;

    await revision(drop.id, group_summary(keep, drop), ["mergedIntoId"]);
    if (changed.length) await revision(keep.id, `Took ${changed.join(", ")} from duplicate "${drop.name}" (#${drop.id}) before retiring it`, changed);
    touchedPaths.push(`/lenses/${keep.slug}`, `/lenses/${drop.slug}`);
    console.log(`  merged #${drop.id} into #${keep.id}${changed.length ? ` (took ${changed.join(", ")})` : ""}${moved.length ? ` (${moved.length} ratings moved)` : ""}`);
  }

  // A keeper retired in a later pair leaves a chain (A → B → C). Point every
  // retired row at the live survivor; the page follows one hop only.
  for (let hops = 0; hops < 5; hops++) {
    const flattened = await sql`update lenses l set merged_into_id = k.merged_into_id
      from lenses k where l.merged_into_id = k.id and k.merged_into_id is not null returning l.id`;
    if (!flattened.length) break;
    console.log(`  flattened ${flattened.length} redirect chain(s)`);
  }

  if (process.env.CRON_SECRET) {
    const r = await fetch(`${process.env.API_URL ?? "https://thelensdb.com"}/api/cron/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ tags: ["lenses"], paths: touchedPaths }),
    });
    console.log(`\nrevalidate: HTTP ${r.status}`);
  } else {
    console.log(`\nCRON_SECRET not set: call /api/cron/revalidate yourself for the "lenses" tag.`);
  }
  console.log(`Done. ${merged} merged; before-values in ${backupPath}`);
} finally {
  await sql.end();
}
