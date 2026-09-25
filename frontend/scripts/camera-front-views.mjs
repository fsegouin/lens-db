/**
 * Picks the straight-on cut-out each camera's size comparison is drawn from
 * and records it in cameras.front_view.
 *
 * A photo qualifies when it has a transparent ground and the outline of what
 * it shows has the same width-to-height ratio as the recorded dimensions,
 * within TOLERANCE. That one test does the sorting: an angled shot shows the
 * side as well as the front, so its outline is too wide or too narrow for the
 * spec, and it is dropped. So is a straight-on photo whose lens hangs below
 * the baseplate, which costs coverage but never draws a camera at the wrong
 * size. The first qualifying image wins, because galleries lead with the
 * front view.
 *
 * Opaque photos are skipped. Cutting them out is a separate pass.
 *
 * A camera that already has a front_view keeps it unless --force is given,
 * so a hand-picked view survives a rerun. Nothing is written without --apply.
 *
 * Usage (from frontend/):
 *   node scripts/camera-front-views.mjs
 *   node scripts/camera-front-views.mjs --apply
 *   node scripts/camera-front-views.mjs --apply --force --slug nikon-z-50-2019
 *
 * Requires DATABASE_URL (in .env.local).
 */

import { createSql } from "./lib/db.mjs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { cameraDimensionsFromSpecs } from "../src/lib/camera-dimensions.ts";

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
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const ONLY_SLUG = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;

const TOLERANCE = 0.08;
// Pixels at or below this alpha count as ground: cut-outs carry a faint
// anti-aliased fringe that would otherwise widen the outline.
const ALPHA_FLOOR = 20;
const MIN_OUTLINE_PX = 200;
const CONCURRENCY = 8;
const IMAGE_HOST = "https://pub-452f806914084c1384d3fafe70f6be32.r2.dev/";
// The bucket refuses requests without a browser user agent.
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; lens-db front-view script)" };

/** The outline of a transparent-ground image, or a reason it is not one. */
async function outlineOf(src) {
  const res = await fetch(src, { headers: FETCH_HEADERS });
  if (!res.ok) return { reject: `HTTP ${res.status}` };
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return { reject: "opaque" };

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alpha = (x, y) => data[(y * width + x) * channels + channels - 1];

  const corners = [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)];
  if (Math.max(...corners) > ALPHA_FLOOR) return { reject: "alpha channel but no transparent ground" };

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha(x, y) <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { reject: "empty" };
  const crop = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  if (Math.max(crop.w, crop.h) < MIN_OUTLINE_PX) return { reject: "too small" };
  return { view: { src, width, height, crop } };
}

async function frontViewFor(camera) {
  const dims = cameraDimensionsFromSpecs(camera.specs);
  if (!dims) return { reject: "no dimensions" };
  const target = dims.widthMm / dims.heightMm;
  const reasons = [];
  for (const image of camera.images ?? []) {
    if (typeof image?.src !== "string" || !image.src.startsWith(IMAGE_HOST)) continue;
    let result;
    try {
      result = await outlineOf(image.src);
    } catch (err) {
      result = { reject: err.message };
    }
    if (result.reject) {
      reasons.push(result.reject);
      continue;
    }
    const ratio = result.view.crop.w / result.view.crop.h;
    if (Math.abs(ratio / target - 1) <= TOLERANCE) return { view: result.view, ratio, target };
    reasons.push(`outline ${ratio.toFixed(2)} vs spec ${target.toFixed(2)}`);
  }
  return { reject: reasons.length ? reasons.join("; ") : "no hosted images" };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const sql = createSql();
const cameras = await sql`
  SELECT id, slug, specs, images, front_view
  FROM cameras
  WHERE merged_into_id IS NULL
    AND jsonb_array_length(images) > 0
    ${ONLY_SLUG ? sql`AND slug = ${ONLY_SLUG}` : sql``}
    ${FORCE ? sql`` : sql`AND front_view IS NULL`}
  ORDER BY id
`;
console.log(`${cameras.length} cameras to check${APPLY ? "" : " (dry run)"}`);

let done = 0;
const results = await mapPool(cameras, CONCURRENCY, async (camera) => {
  const result = await frontViewFor(camera);
  if (++done % 100 === 0) console.log(`  ${done}/${cameras.length}`);
  return { camera, ...result };
});

const found = results.filter((r) => r.view);
const tally = {};
for (const r of results) {
  if (r.view) continue;
  const key = r.reject.includes("outline") ? "no photo matches the spec ratio" : r.reject.split(";")[0];
  tally[key] = (tally[key] ?? 0) + 1;
}
console.log(`\n${found.length} front views found`);
for (const [reason, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${n} skipped: ${reason}`);
if (ONLY_SLUG) {
  for (const { camera, view, reject } of results) {
    console.log(`\n${camera.slug}: ${view ? `front view ${view.src}` : `none (${reject})`}`);
  }
}

if (!APPLY) {
  console.log("\nDry run. Pass --apply to write.");
  process.exit(0);
}

for (const { camera, view } of found) {
  await sql`UPDATE cameras SET front_view = ${JSON.stringify(view)}::jsonb WHERE id = ${camera.id}`;
}
console.log(`Wrote ${found.length} front views.`);
await sql.end();
