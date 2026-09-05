/**
 * Backfill camera images from Wikimedia Commons.
 *
 * 73% of the film bodies have no image at all, and Commons is the only free
 * source with real coverage of them. Pipeline mirrors enrich-existing-cameras.mjs:
 *   resolve on Commons -> fetch 640px render -> classify background ->
 *   sharp 500x500 webp -> R2 -> UPDATE cameras.images
 *
 * Unlike the earlier one-off enrich scripts, each stored image keeps its
 * licence and author: CC BY-SA obliges us to credit, and the gallery now
 * renders that credit.
 *
 * Usage:
 *   node scripts/backfill-commons-images.mjs --dry-run --limit 200
 *   node scripts/backfill-commons-images.mjs --limit 50
 *
 * Flags:
 *   --dry-run        resolve and classify, write nothing to R2 or the DB
 *   --limit N        how many cameras to process (default 50)
 *   --digital        include digital bodies too (default: film only)
 *   --per-camera N   images to store per camera (default 2)
 *   --report PATH    write the full per-camera outcome as JSON
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createSql } from "./lib/db.mjs";
import { resolveCommonsImages, isSpecialEdition, delay } from "./lib/commons.mjs";
import { isSamePhoto } from "./lib/same-photo.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const dryRun = args.includes("--dry-run");
const limit = Number(flag("--limit", 50));
const perCamera = Number(flag("--per-camera", 2));
const includeDigital = args.includes("--digital");
const reportPath = flag("--report", null);

const UA = "lens-db-image-backfill/1.0 (https://thelensdb.com; florent@segouin.me)";

// A studio shot on white must sit on a white plate or it glows on the dark
// theme; a cut-out can sit on any plate; a photo in the wild brings its own
// background. The gallery reads this back to pick the plate.
//
// Added to the filename score rather than sorted on first: a clean background
// is worth less than actually being a photo of the right camera (name match is
// worth 40), so a stray "Spiegel.jpg" on a grey desk cannot outrank
// "Fujica ST801 front.jpg".
const BACKGROUND_BONUS = { alpha: 30, white: 18, plain: 8, scene: 0 };

/**
 * Classify what is behind the subject, from the four corners inward.
 * Corners are the cheapest reliable signal: a cut-out has transparent corners,
 * a product shot has four near-white ones, a photo in the wild has neither.
 */
async function classifyBackground(buffer) {
  const meta = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * info.width + x) * info.channels;

  // Average a small patch in each corner rather than reading one pixel. A
  // studio shot on grey seamless has real lighting falloff, so single pixels
  // read 0xda in one corner and 0xba in another and the ground looks like a
  // scene, which then gets a dark plate and the glowing-rectangle artefact.
  const patch = Math.max(2, Math.round(Math.min(info.width, info.height) * 0.04));
  const corner = (x0, y0) => {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < y0 + patch; y++) {
      for (let x = x0; x < x0 + patch; x++) {
        const i = at(x, y);
        r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
        n++;
      }
    }
    return { r: r / n, g: g / n, b: b / n, a: a / n };
  };
  const corners = [
    corner(0, 0),
    corner(info.width - patch, 0),
    corner(0, info.height - patch),
    corner(info.width - patch, info.height - patch),
  ];

  const hex = (c) =>
    "#" +
    [c.r, c.g, c.b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("");
  const mean = (k) => corners.reduce((sum, c) => sum + c[k], 0) / corners.length;
  const ground = hex({ r: mean("r"), g: mean("g"), b: mean("b") });

  if (meta.hasAlpha && corners.every((c) => c.a < 30)) return { background: "alpha" };
  if (corners.every((c) => c.r > 235 && c.g > 235 && c.b > 235)) {
    return { background: "white", plateColor: ground };
  }
  // A uniform, unsaturated ground (grey seamless, light table) still sits on a
  // light plate. The spread tolerance is wide enough for lighting falloff
  // across the frame, which is routine in a studio shot.
  const spread = (k) => Math.max(...corners.map((c) => c[k])) - Math.min(...corners.map((c) => c[k]));
  const flat = spread("r") < 55 && spread("g") < 55 && spread("b") < 55;
  const grey = corners.every((c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 22);
  const light = corners.every((c) => (c.r + c.g + c.b) / 3 > 150);
  if (flat && grey && light) return { background: "plain", plateColor: ground };
  return { background: "scene" };
}

/**
 * dHash: 9x8 greyscale, one bit per adjacent-pixel comparison, 64 bits total.
 *
 * Commons often holds the same photograph twice under different names, usually
 * because someone re-imported it from Flickr. The Pentax P30's two files are
 * distinct pages with distinct bytes and the same picture, which the carousel
 * then showed twice.
 */
async function perceptualHash(buffer) {
  const px = await sharp(buffer).resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(px[y * 9 + x] < px[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return bits;
}

const hammingDistance = (a, b) => a.reduce((n, bit, i) => n + (bit === b[i] ? 0 : 1), 0);

// Measured over the ingested pairs: genuinely different views of a camera sit
// at 27-29, the duplicated Pentax P30 photograph at 3. Anything under 10 is the
// same picture.
const DUPLICATE_DISTANCE = 10;

async function fetchBuffer(url) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`fetch ${url} -> ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * R2 keys carry a digest of the source image.
 *
 * Objects are uploaded `immutable, max-age=31536000`, so a key that stays the
 * same across a re-ingest keeps serving last week's photograph out of every
 * cache for a year, no matter what the database says. Putting the content in
 * the key means new content is always a new URL.
 */
const r2KeyForSlug = (slug, n, buffer) => {
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 10);
  return `cameras/${slug.replace(/^camera\//, "")}/${n}-${digest}.webp`;
};

const sql = createSql();

const filmClause = includeDigital ? "" : "AND sensor_type IS NULL";
const cameras = await sql.unsafe(`
  SELECT id, name, slug, alias, view_count
  FROM cameras
  WHERE merged_into_id IS NULL
    AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 0
    ${filmClause}
  ORDER BY view_count DESC NULLS LAST, id
  LIMIT ${Number.isFinite(limit) ? limit : 50}
`);

console.log(`${cameras.length} cameras to try (dryRun=${dryRun}, perCamera=${perCamera})\n`);

const report = [];
const tally = { resolved: 0, skippedEdition: 0, noMatch: 0, licenceRejected: 0, errors: 0, updated: 0 };
const backgrounds = { alpha: 0, white: 0, plain: 0, scene: 0 };

// A run that keeps going after the network dies burns the whole camera list
// recording failures against nothing. Ten in a row is well past bad luck.
const ABORT_AFTER_CONSECUTIVE_ERRORS = 10;
let consecutiveErrors = 0;

for (const camera of cameras) {
  if (isSpecialEdition(camera.name)) {
    tally.skippedEdition++;
    report.push({ id: camera.id, name: camera.name, outcome: "skipped-special-edition" });
    continue;
  }

  if (consecutiveErrors >= ABORT_AFTER_CONSECUTIVE_ERRORS) {
    console.log(
      `\nAborting: ${consecutiveErrors} cameras in a row failed, which means the network or the ` +
        `API is gone rather than these particular cameras being unlucky. Re-run to resume: the ` +
        `query only selects cameras that still have no images.`,
    );
    break;
  }

  let resolved;
  try {
    // One more candidate than we need, so discarding a duplicate does not
    // cost the second slot outright.
    resolved = await resolveCommonsImages(camera.name, { limit: perCamera + 2, aliases: [camera.alias] });
  } catch (err) {
    tally.errors++;
    consecutiveErrors++;
    report.push({ id: camera.id, name: camera.name, outcome: "resolve-error", error: err.message });
    console.log(`[${camera.id}] ${camera.name}\n  resolve failed: ${err.message}`);
    continue;
  }

  const candidates = resolved.images;
  if (!candidates.length) {
    tally.noMatch++;
    if (resolved.rejectedByLicence) tally.licenceRejected++;
    report.push({
      id: camera.id,
      name: camera.name,
      outcome: resolved.rejectedByLicence ? "no-free-licence" : "no-match",
      rejectedByLicence: resolved.rejectedByLicence,
    });
    consecutiveErrors = 0;
    const why = resolved.rejectedByLicence
      ? `${resolved.rejectedByLicence} file(s) found but none under a usable licence`
      : "no usable Commons match";
    console.log(`[${camera.id}] ${camera.name}\n  ${why}`);
    continue;
  }

  // Download once, classify, then let the background decide the final order.
  const fetched = [];
  for (const c of candidates) {
    try {
      const buffer = await fetchBuffer(c.thumburl || c.url);
      fetched.push({
        ...c,
        buffer,
        ...(await classifyBackground(buffer)),
        phash: await perceptualHash(buffer),
      });
    } catch {
      /* candidate unreadable, try the next */
    }
    await delay(150);
  }
  if (!fetched.length) {
    tally.errors++;
    consecutiveErrors++;
    report.push({ id: camera.id, name: camera.name, outcome: "download-error" });
    continue;
  }

  for (const f of fetched) f.rank = f.score + BACKGROUND_BONUS[f.background];
  fetched.sort((a, b) => b.rank - a.rank);

  // The lead image is whatever ranked best: inside a category that matched the
  // model, even an oddly named file is usually the right camera. Later images
  // have to earn their place by naming the model, or a page picks up the
  // category's stray "Shutter speed dial.png" as its second photo. They also
  // have to be a different photograph from the ones already chosen.
  const NAMED = 40; // the name-match bonus in scoreFile
  const chosen = [fetched[0]];
  for (const candidate of fetched.slice(1)) {
    if (chosen.length >= perCamera) break;
    if (candidate.score < NAMED) continue;

    // The hash settles the cheap cases for free; the vision model is only
    // consulted for pairs it cannot separate, which is where two photographers
    // shooting the same view of the same camera end up.
    const hashDuplicate = chosen.some(
      (picked) => hammingDistance(picked.phash, candidate.phash) < DUPLICATE_DISTANCE,
    );
    if (hashDuplicate) continue;

    let duplicate = false;
    for (const picked of chosen) {
      const verdict = await isSamePhoto(picked.buffer, candidate.buffer);
      if (verdict.duplicate) {
        console.log(`  dropped near-duplicate: ${candidate.title} (${verdict.reason})`);
        duplicate = true;
        break;
      }
    }
    if (!duplicate) chosen.push(candidate);
  }

  const images = chosen.map((c, i) => ({
    src: r2KeyForSlug(camera.slug, i + 1, c.buffer), // replaced with the public URL on upload
    alt: camera.name,
    credit: c.credit || undefined,
    license: c.license || undefined,
    licenseUrl: c.licenseUrl || undefined,
    sourceUrl: c.descriptionUrl || undefined,
    background: c.background,
    plateColor: c.plateColor || undefined,
  }));

  tally.resolved++;
  consecutiveErrors = 0;
  for (const c of chosen) backgrounds[c.background]++;

  console.log(`[${camera.id}] ${camera.name}  (${camera.view_count ?? 0} views, via ${chosen[0].via})`);
  for (const c of chosen) {
    console.log(`  ${c.background.padEnd(5)} rank=${String(c.rank).padStart(3)}  ${c.title}`);
    console.log(`        ${c.license || "?"} / ${c.credit || "no author"}`);
  }

  if (dryRun) {
    report.push({
      id: camera.id,
      name: camera.name,
      outcome: "would-update",
      images: images.map((img, i) => ({ ...img, src: chosen[i].descriptionUrl })),
    });
    await delay(250);
    continue;
  }

  try {
    const { processAndUpload } = await import("./lib/r2-upload.mjs");
    for (let i = 0; i < chosen.length; i++) {
      images[i].src = await processAndUpload(chosen[i].buffer, r2KeyForSlug(camera.slug, i + 1, chosen[i].buffer));
    }
    await sql`UPDATE cameras SET images = ${JSON.stringify(images)}::jsonb WHERE id = ${camera.id}`;
    tally.updated++;
    console.log(`  updated with ${images.length} image(s)`);
  } catch (err) {
    tally.errors++;
    consecutiveErrors++;
    report.push({ id: camera.id, name: camera.name, outcome: "upload-error", error: err.message });
    console.log(`  upload/update failed: ${err.message}`);
    continue;
  }

  report.push({ id: camera.id, name: camera.name, outcome: "updated", images });
  await delay(250);
}

console.log(`\n--- summary over ${cameras.length} cameras ---`);
console.log(`resolved             ${tally.resolved}`);
console.log(`no Commons match     ${tally.noMatch}  (of which licence-blocked: ${tally.licenceRejected})`);
console.log(`skipped (edition)    ${tally.skippedEdition}`);
console.log(`errors               ${tally.errors}`);
if (!dryRun) console.log(`rows updated         ${tally.updated}`);
console.log(`backgrounds          ${JSON.stringify(backgrounds)}`);
const hitRate = cameras.length ? Math.round((tally.resolved / cameras.length) * 100) : 0;
console.log(`hit rate             ${hitRate}%`);

if (reportPath) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`report               ${reportPath}`);
}

await sql.end();
