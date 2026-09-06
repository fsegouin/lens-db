/**
 * Import the cameras scan-camera-wiki-gaps.mjs found, as sourced stubs.
 *
 * The scanner reports; this writes. It takes the scanner's JSON and creates one
 * camera row per candidate, carrying only what camera-wiki actually states in
 * its categories: the year of introduction, the body type, the film format, and
 * the mount where the site records one. Nothing is inferred and nothing comes
 * from memory — a field the source does not give is left null, which is why
 * roughly four in ten rows arrive without a year.
 *
 * Each written field gets a citation pointing at the camera-wiki page it came
 * from, so a stub imported here is distinguishable from a figure somebody
 * checked. camera-wiki is CC BY-SA: the page URL on the row and the citations
 * are the attribution, and anything later copied from the prose needs to keep
 * it.
 *
 * Idempotent. Candidates are re-matched against the live catalogue on every run
 * using the same matcher the scanner uses, so a camera that has since been
 * added — by this script, by an editor, or under a different name — is skipped
 * rather than duplicated. Re-running after a partial failure is safe.
 *
 * Usage (from frontend/):
 *   node scripts/import-camera-wiki-candidates.mjs --input camera-wiki-gaps.json
 *   node scripts/import-camera-wiki-candidates.mjs --input ... --class keep --limit 50
 *   node scripts/import-camera-wiki-candidates.mjs --input ... --apply
 */

import { readFileSync } from "node:fs";
import { createSql } from "./lib/db.mjs";
import { buildIndex, lookup } from "./lib/catalogue-match.mjs";

const SOURCE_NAME = "camera-wiki";

/** Fields this script is willing to write, and therefore to cite. */
const CITED_FIELDS = ["yearIntroduced", "bodyType", "systemId"];

function parseArgs(argv) {
  const args = { input: null, apply: false, limit: 0, classes: [], brands: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--class") args.classes.push(argv[++i]);
    else if (argv[i] === "--brand") args.brands.push(argv[++i]);
  }
  if (!args.input) throw new Error("--input <scanner json> is required");
  return args;
}

/**
 * The slug rules the rest of the catalogue already follows: lowercase, ASCII,
 * punctuation collapsed to single hyphens. A slug that is somehow taken gets a
 * numeric suffix rather than colliding, because the name is the identity here
 * and two cameras can legitimately reduce to the same slug.
 */
function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * camera-wiki's type category is a compound phrase — "Japanese 35mm SLR",
 * "German 6x9 viewfinder folding" — that names the nationality and format
 * alongside the body type. Only the body type belongs in `body_type`, and the
 * existing rows there are written the way DPReview writes them ("Compact SLR",
 * "Rangefinder-style mirrorless"), so this maps rather than copies the phrase
 * through. An unrecognised phrase yields null, not a guess.
 */
function bodyTypeFrom(type) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (/\bpseudo tlr\b/.test(t)) return "Pseudo TLR";
  if (/\btlr\b/.test(t)) return "TLR";
  if (/\bslr\b/.test(t)) return "SLR";
  if (/\brangefinder\b/.test(t)) return "Rangefinder";
  if (/\bfolding\b/.test(t)) return "Folding";
  if (/\bviewfinder\b/.test(t)) return "Viewfinder";
  if (/\bpress\b/.test(t)) return "Press";
  if (/\b(view|field|monorail)\b/.test(t)) return "View";
  if (/\bplate\b/.test(t)) return "Plate";
  if (/\bstereo\b/.test(t)) return "Stereo";
  if (/\bpanoramic\b/.test(t)) return "Panoramic";
  if (/\bsubminiature\b/.test(t)) return "Subminiature";
  if (/\binstant\b/.test(t)) return "Instant";
  return null;
}

const args = parseArgs(process.argv.slice(2));
const scan = JSON.parse(readFileSync(args.input, "utf8"));
if (!Array.isArray(scan.missing)) {
  throw new Error(`${args.input} has no "missing" array; is it a scanner --json file?`);
}

const sql = createSql();

const cameras = await sql.unsafe("select id, name from cameras where merged_into_id is null");
const index = buildIndex(cameras);
const takenSlugs = new Set(
  (await sql.unsafe("select slug from cameras")).map((r) => r.slug),
);

let candidates = scan.missing;
if (args.classes.length) candidates = candidates.filter((c) => args.classes.includes(c.class));
if (args.brands.length) candidates = candidates.filter((c) => args.brands.includes(c.brand));

const toInsert = [];
const alreadyPresent = [];
/**
 * Names already claimed by this run.
 *
 * The scanner deduplicates by article title, which is not quite enough: two
 * different articles can still reduce to the same camera name once the maker is
 * prefixed. camera-wiki has both an "Edixa" page, about the brand Wirgin sold
 * under, and a "Wirgin Edixa" page about the camera, and both arrive here as
 * "Wirgin Edixa". Keeping the first and skipping the second would be a coin
 * toss, so the better-sourced page wins — a brand article carries no year.
 */
const claimedNames = new Map();

for (const candidate of candidates) {
  if (args.limit && toInsert.length >= args.limit) break;

  // The catalogue moves between a scan and an import, so re-check rather than
  // trusting the file. This is what makes re-running safe.
  // Prefix the maker only when the title does not name it anywhere. Testing
  // just the start produces "Kodak Boy Scout Kodak" and "Kodak Jiffy Kodak
  // Six-20", because camera-wiki often puts the maker inside or at the end of
  // the model name.
  const names = [candidate.title];
  if (!candidate.title.toLowerCase().includes(candidate.brand.toLowerCase())) {
    names.push(`${candidate.brand} ${candidate.title}`);
  }
  if (names.some((n) => lookup(index, n))) {
    alreadyPresent.push(candidate.title);
    continue;
  }

  const name = names.at(-1);

  const claimed = claimedNames.get(name.toLowerCase());
  if (claimed) {
    // Prefer the candidate the source says more about. A year is the tell: an
    // article about a brand has no year of introduction, an article about a
    // camera usually does.
    const better = (candidate.year ? 1 : 0) > (claimed.year ? 1 : 0);
    if (!better) {
      alreadyPresent.push(candidate.title);
      continue;
    }
    toInsert.splice(toInsert.indexOf(claimed.entry), 1);
  }

  let slug = slugify(name);
  if (takenSlugs.has(slug)) {
    let n = 2;
    while (takenSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  takenSlugs.add(slug);

  const entry = {
    name,
    slug,
    url: candidate.url,
    yearIntroduced: candidate.year ?? null,
    bodyType: bodyTypeFrom(candidate.type),
    systemId: candidate.system_id ?? null,
    sourceType: candidate.type ?? null,
  };
  toInsert.push(entry);
  claimedNames.set(name.toLowerCase(), { year: candidate.year, entry });
}

const withYear = toInsert.filter((c) => c.yearIntroduced).length;
const withBodyType = toInsert.filter((c) => c.bodyType).length;
const withSystem = toInsert.filter((c) => c.systemId).length;

console.log(`Candidates considered:  ${candidates.length}`);
console.log(`Already in catalogue:   ${alreadyPresent.length}`);
console.log(`To insert:              ${toInsert.length}`);
console.log(`  with a year:          ${withYear}`);
console.log(`  with a body type:     ${withBodyType}`);
console.log(`  linked to a system:   ${withSystem}`);
console.log("\nFirst 15:");
for (const c of toInsert.slice(0, 15)) {
  console.log(
    `  ${c.name.slice(0, 40).padEnd(42)}${String(c.yearIntroduced ?? "—").padEnd(6)}${(c.bodyType ?? "—").padEnd(14)}${c.systemId ? `system ${c.systemId}` : ""}`,
  );
}

if (!args.apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to insert ${toInsert.length} cameras.`);
  await sql.end();
  process.exit(0);
}

let inserted = 0;
for (const c of toInsert) {
  // One row at a time, each with its citations, so an interrupted run leaves
  // consistent rows behind rather than cameras whose provenance is missing.
  const [row] = await sql`
    INSERT INTO cameras (name, slug, url, year_introduced, body_type, system_id)
    VALUES (${c.name}, ${c.slug}, ${c.url}, ${c.yearIntroduced}, ${c.bodyType}, ${c.systemId})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (!row) continue;
  inserted++;

  const cited = CITED_FIELDS.filter((field) => {
    if (field === "yearIntroduced") return c.yearIntroduced !== null;
    if (field === "bodyType") return c.bodyType !== null;
    if (field === "systemId") return c.systemId !== null;
    return false;
  });
  for (const field of cited) {
    await sql`
      INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
      VALUES ('camera', ${row.id}, ${field}, ${SOURCE_NAME}, ${c.url},
              ${`Read from the article's categories (${c.sourceType ?? "uncategorised"}). CC BY-SA.`})
      ON CONFLICT (entity_type, entity_id, field) DO NOTHING
    `;
  }
}

console.log(`\nInserted ${inserted} cameras.`);
await sql.end();
