/**
 * Put mir.com.my photographs on the lens and camera rows they belong to.
 *
 * Input is a crawl (scraper/mir-nikkor-scrape.mjs) plus the `--json` output of
 * map-mir-to-lenses.mjs or map-mir-to-cameras.mjs, so only rows a matcher
 * already tied to a page are touched.
 *
 * Credit: mir credits per page, sometimes naming a contributor ("Image
 * courtesy of ..."), otherwise nothing. Where a page names someone, they are
 * the credit; otherwise the credit is the site. Either way the licence line
 * reads "Courtesy of mir.com.my" and links back to the page the photo came
 * from, because we hold a courtesy credit here, not a licence grant.
 *
 * Images are resized and re-hosted on our R2 like every other ingest, so we
 * never hotlink their bandwidth.
 *
 * Usage (from frontend/):
 *   node scripts/import-mir-images.mjs ../scraper/mir-nikkor.json map.json --type lenses
 *   node scripts/import-mir-images.mjs ... --type lenses --apply
 *   node scripts/import-mir-images.mjs ... --type cameras --apply --all
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createSql } from "./lib/db.mjs";
import { classifyBackground } from "./lib/image-ingest.mjs";
import { isSamePhoto } from "./lib/same-photo.mjs";
import { delay } from "./lib/commons.mjs";

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
const positional = args.filter((a) => !a.startsWith("--"));
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const [crawlFile, mapFile] = positional;
const type = argVal("--type");
const apply = args.includes("--apply");
const all = args.includes("--all");
const reportOut = argVal("--report");
const MAX_PER_ROW = parseInt(argVal("--max") ?? "3", 10);
const LIMIT = parseInt(argVal("--limit") ?? "100000", 10);

if (!crawlFile || !mapFile || !["lenses", "cameras"].includes(type)) {
  console.error("usage: node scripts/import-mir-images.mjs <crawl.json> <map.json> --type lenses|cameras [--apply] [--all]");
  process.exit(1);
}

const crawl = JSON.parse(readFileSync(resolve(crawlFile), "utf8"));
const mapping = JSON.parse(readFileSync(resolve(mapFile), "utf8"));
const pageByUrl = new Map(crawl.pages.map((p) => [p.url, p]));

// Site furniture (rules, spacers, banners) repeats across pages; a photo of a
// lens does not. Anything on three or more pages is chrome, not content.
const pageCount = new Map();
for (const page of crawl.pages) {
  for (const src of new Set(page.images ?? [])) pageCount.set(src, (pageCount.get(src) ?? 0) + 1);
}

const UA = "thelensdb-image-ingest/1.0 (+https://thelensdb.com; contact florent@segouin.me)";
const MIN_EDGE = 120; // below this it is a button, a bullet or a spacer

/**
 * Is this file plausibly a photograph of *this* product?
 *
 * Two filters, both learned from a dry run. GIFs on this site are depth-of-
 * field scales, viewfinder diagrams and animations, never product
 * photography. And a page carries more than its subject: the AI-S 18mm page
 * offered "digitize_future_A.jpg", a banner for an unrelated service.
 *
 * mir names its product shots after the product ("Nikkor15mmf56nonAi.jpg",
 * "18mmf35AISside.JPG", "nonai13mmf56.jpg"), so requiring the filename to
 * carry an identifying token is a cheap, precise filter. A missing photograph
 * beats a wrong one, which is the call the Commons ingest made too.
 */
// Lens families that share a focal length. mir files every 500mm on one page,
// so "afs2500mmf4edif.jpg" (an AF-S) sits next to the AI 500mm f/4P and passes
// a plain focal-length test. A filename claiming a family our row is not in is
// a photograph of a different lens.
const FAMILY_TOKENS = ["afs", "af", "rf", "ais", "ai", "series e", "seriese"];

function subjectScore(url, hints) {
  const file = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
  // GIFs on this site are depth-of-field scales, viewfinder diagrams and
  // animations, never product photography.
  if (/\.gif$/.test(file)) return 0;
  const squashed = file.replace(/[^a-z0-9]/g, "");

  let score = 0;
  if (hints.focal.some((h) => squashed.includes(h))) score += 3;
  if (hints.aperture && squashed.includes(hints.aperture)) score += 2;

  // Detail crops (the data plate, the meter prong, the depth-of-field scale)
  // are real photographs of the right lens but make a poor lead image, so they
  // sort below a full view rather than being excluded.
  if (/(dof|lensdata|prong|scale|chart|diagram|screen|mount|rear|cap)/.test(squashed)) score -= 1;

  // "af" is a substring of far too much ("half", "leaf"), so family tokens are
  // only read at a boundary of the original filename, not the squashed form.
  for (const token of FAMILY_TOKENS) {
    const inFile = new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(file);
    if (inFile && !hints.families.includes(token)) score -= 4;
  }
  return score;
}

/**
 * Filename fragments that identify this row's product. For a lens that is its
 * focal length as mir writes it ("15mm", "80200"); for a body it is the model
 * name with the maker dropped ("fm3a", "ft2").
 */
function hintsFor(row, entry) {
  const name = row.name.toLowerCase();
  const families = FAMILY_TOKENS.filter((t) => new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(name));

  if (type !== "lenses") {
    const focal = row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length >= 2 && !["nikon", "nikkormat", "nippon", "kogaku"].includes(t));
    return { focal, aperture: null, families };
  }

  const focal = [];
  const f = entry.mir?.focal;
  const fMax = entry.mir?.focalMax;
  // A bare focal number is far too loose: "85" matched "2585cmf45hendry.jpg",
  // a 25-85mm, onto the 85-250mm. And for a zoom the wide end alone is just as
  // loose in the other direction, because "28mmduallenscompared.jpg" is a pair
  // of 28mm primes, not the 28-50mm zoom. A zoom must be named as a range.
  if (f && fMax) {
    focal.push(`${f}${fMax}`);
  } else if (f) {
    focal.push(`${f}mm`);
  }
  const a = entry.mir?.aperture;
  return { focal, aperture: a ? `f${String(a).replace(".", "")}` : null, families };
}

async function fetchImage(url) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return null;
  }
  if (!meta.width || !meta.height) return null;
  if (meta.width < MIN_EDGE || meta.height < MIN_EDGE) return null;
  // A very wide, very short image is a divider rule.
  if (meta.width / meta.height > 6 || meta.height / meta.width > 6) return null;
  return { buffer, meta };
}

/**
 * The name to print under the photo.
 *
 * mir's courtesy lines run into contact details ("Mr Bil Barry <
 * bbarry1@tampabay.rr.com >", "Mr Ken Knezick < Ken@islandream.com"), and
 * republishing someone's email address on a public page is not something a
 * credit line should do. Cut at the first bracket or address, drop the
 * honorific and the trademark furniture, and fall back to the site when what
 * is left is not a name.
 */
function cleanCredit(raw) {
  if (!raw) return "mir.com.my";
  let name = raw
    .split(/[<(]|\bmailto\b|[\w.+-]+@/i)[0]
    .replace(/[®™©"“”']/g, "")
    // "Image courtesy of my good friend CY LEOW" names a person behind some
    // warmth; the credit line wants the person.
    .replace(/^\s*(?:my|our)?\s*(?:good\s+)?friend\s+/i, "")
    .replace(/^\s*(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\s,.;:-]+$/, "")
    .trim();
  // Some courtesy lines thank a group rather than name a photographer ("all
  // the nice folks from Taiwan"). That is not an attribution, so it falls back
  // to the site.
  if (/^(all|the|everyone|folks)\b/i.test(name) || /\bfolks\b/i.test(name)) return "mir.com.my";
  if (name.length < 2 || name.length > 60) return "mir.com.my";
  return name;
}

const r2Key = (slug, n, buffer) => {
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 10);
  return `${type}/${slug.replace(/^camera\//, "").replace(/\//g, "__")}/mir-${n}-${digest}.webp`;
};

const sql = createSql();
const tally = { considered: 0, skippedHasImages: 0, noUsableImage: 0, updated: 0, errors: 0, imagesAdded: 0 };
const report = [];

try {
  const matched = mapping.filter((r) => r.match).slice(0, LIMIT);
  const ids = [...new Set(matched.map((r) => r.match.id))];
  // db.mjs's `unsafe` takes no parameters; `query` is the parameterised form.
  const rows = await sql.query(`SELECT id, name, slug, images FROM ${type} WHERE id = ANY($1::int[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Two mir pages can describe one lens (the 2000mm Reflex-Nikkor appears in
  // both the reflex index and the 60/70s telephoto section). `byId` is read
  // once, so a second pass over the same row would see the pre-run image list,
  // rebuild from scratch and overwrite what the first pass just wrote: three
  // images uploaded, then orphaned. One write per row per run.
  const done = new Set();

  for (const entry of matched) {
    const row = byId.get(entry.match.id);
    if (!row) continue;
    if (done.has(row.id)) continue;
    done.add(row.id);
    const existing = Array.isArray(row.images) ? row.images : [];
    tally.considered++;

    if (existing.length && !all) {
      tally.skippedHasImages++;
      continue;
    }

    const page = pageByUrl.get(entry.page);
    if (!page) continue;

    const hints = hintsFor(row, entry);
    const candidates = (page.images ?? [])
      .filter((src) => (pageCount.get(src) ?? 0) < 3)
      .map((src) => ({ src, score: subjectScore(src, hints) }))
      .filter((c) => c.score >= 3)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.src);
    const chosen = [];
    for (const src of candidates) {
      if (chosen.length >= MAX_PER_ROW) break;
      const got = await fetchImage(src).catch(() => null);
      await delay(200);
      if (!got) continue;

      let duplicate = false;
      for (const picked of chosen) {
        const verdict = await isSamePhoto(picked.buffer, got.buffer);
        if (verdict.duplicate) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;

      chosen.push({ src, buffer: got.buffer, ...(await classifyBackground(got.buffer)) });
    }

    if (!chosen.length) {
      tally.noUsableImage++;
      report.push({ id: row.id, name: row.name, outcome: "no-usable-image", page: entry.page });
      continue;
    }

    const credit = cleanCredit(page.creditName);
    const images = chosen.map((c, i) => ({
      src: r2Key(row.slug, existing.length + i + 1, c.buffer),
      alt: row.name,
      credit,
      license: "Courtesy of mir.com.my",
      sourceUrl: entry.page,
      background: c.background,
      plateColor: c.plateColor || undefined,
    }));

    console.log(`[${row.id}] ${row.name}  ${chosen.length} image(s), credit "${credit}"`);
    for (const c of chosen) console.log(`  ${c.background.padEnd(5)} ${c.src}`);

    if (!apply) {
      report.push({
        id: row.id,
        name: row.name,
        outcome: "would-update",
        page: entry.page,
        images: images.map((img, i) => ({ ...img, src: chosen[i].src })),
      });
      continue;
    }

    try {
      const { processAndUpload } = await import("./lib/r2-upload.mjs");
      for (let i = 0; i < chosen.length; i++) {
        images[i].src = await processAndUpload(chosen[i].buffer, images[i].src);
      }
      const next = [...existing, ...images];
      await sql.query(`UPDATE ${type} SET images = $1::jsonb WHERE id = $2`, [JSON.stringify(next), row.id]);
      tally.updated++;
      tally.imagesAdded += images.length;
      console.log(`  updated (${next.length} image(s) total)`);
    } catch (err) {
      tally.errors++;
      report.push({ id: row.id, name: row.name, outcome: "upload-error", error: err.message });
      console.log(`  upload/update failed: ${err.message}`);
    }
  }

  console.log(`\n${apply ? "APPLIED" : "DRY RUN"} — ${type}`);
  console.log(`  matched rows considered       ${tally.considered}`);
  console.log(`  skipped, already illustrated  ${tally.skippedHasImages}`);
  console.log(`  no usable image on page       ${tally.noUsableImage}`);
  console.log(`  rows updated                  ${tally.updated}`);
  console.log(`  images added                  ${tally.imagesAdded}`);
  console.log(`  errors                        ${tally.errors}`);

  if (reportOut) {
    writeFileSync(resolve(reportOut), JSON.stringify({ tally, report }, null, 2));
    console.log(`\nWrote ${reportOut}`);
  }
} finally {
  await sql.end();
}
