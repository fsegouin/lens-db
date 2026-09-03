/**
 * Promote the built-in lens of a fixed-lens camera into a real `lenses` row
 * and point the body at it with `cameras.built_in_lens_id` (migration 0038).
 *
 * Every lens/camera relation on this site is derived from a shared system_id,
 * so a camera whose lens does not come off had nowhere to put it. The scraped
 * lens-db.com pages did carry the full lens spec — "Original name",
 * "Lens construction", "Closest focusing distance", "Filters" — but only
 * inside the untyped `cameras.specs` blob, where no filter, comparison or
 * search can reach it. This reads that blob and writes typed rows.
 *
 * Cameras sharing one lens (Fujifilm GA645 and GA645i, the Leica I variants
 * fitted with the same Elmar) are grouped onto a single lens row, and a lens
 * that already exists in the catalogue is linked rather than duplicated.
 *
 * Usage (from frontend/):
 *   node scripts/backfill-built-in-lenses.mjs            # dry run
 *   node scripts/backfill-built-in-lenses.mjs --apply    # write
 *
 * Requires migration 0038 and DATABASE_URL.
 */

import { createSql } from "./lib/db.mjs";
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

/** lens-db.com wrote "<No data>" where the booklet had nothing. */
const isBlank = (v) => !v || !String(v).trim() || String(v).includes("<No data>");

/**
 * German and Russian booklets write decimals with a comma ("1:4,5"), and the
 * OCR of the Konishiroku plates read the digit 1 as the letter I ("I:I.9",
 * "I:2"). Only the aperture ratio is rewritten, so an I elsewhere is left be.
 */
function normalizeOriginalName(raw) {
  return String(raw)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bI:I(?=[.\d])/g, "1:1")
    .replace(/\bI:(?=\d)/g, "1:")
    .replace(/\s+/g, " ")
    .trim();
}

/** "38mm", "7.5cm", "55-90mm" — cm is the pre-war unit and converts to mm. */
function parseFocal(text) {
  const explicit = text.match(/f\s*=\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(mm|cm)/i);
  const bare = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(mm|cm)\b/i);
  const m = explicit ?? bare;
  if (m) {
    const scale = m[3].toLowerCase() === "cm" ? 10 : 1;
    const min = Number(m[1]) * scale;
    const max = m[2] ? Number(m[2]) * scale : min;
    if (Number.isFinite(min) && min > 0 && min <= 2000) return { min, max };
  }
  // The German form writes speed over focal length and often drops the unit
  // entirely: "1:2.8/80", "Sonnar 2.3/40".
  const german = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (german) {
    const focal = Number(german[2]);
    if (Number.isFinite(focal) && focal >= 6 && focal <= 2000) return { min: focal, max: focal };
  }
  return null;
}

/**
 * "1:2.8", "1:4.5-6.9", the German "4.5/38mm", the later Konica plates' plain
 * "F1.8", or the separate "Speed" field.
 */
function parseAperture(text, speedField) {
  const ratio = text.match(/1\s*:\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/);
  if (ratio) {
    return { min: Number(ratio[1]), max: ratio[2] ? Number(ratio[2]) : Number(ratio[1]) };
  }
  const german = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?\s*(?:mm)?/i);
  if (german) return { min: Number(german[1]), max: Number(german[1]) };
  const plain = text.match(/\bF[:/]?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\b/i);
  // "GF 35mm" would otherwise read as f/35, so only plausible speeds count.
  if (plain && Number(plain[1]) >= 0.7 && Number(plain[1]) <= 45) {
    return { min: Number(plain[1]), max: plain[2] ? Number(plain[2]) : Number(plain[1]) };
  }
  if (!isBlank(speedField)) {
    const speed = String(speedField).replace(/,/g, ".").match(/(\d+(?:\.\d+)?)/);
    if (speed) return { min: Number(speed[1]), max: Number(speed[1]) };
  }
  return null;
}

/** "8 elements - 5 groups" */
function parseConstruction(text) {
  if (isBlank(text)) return { elements: null, groups: null };
  const m = String(text).match(/(\d+)\s*elements?\s*-\s*(\d+)\s*groups?/i);
  return m ? { elements: Number(m[1]), groups: Number(m[2]) } : { elements: null, groups: null };
}

/**
 * "46mm" is a filter thread. "Bayonet type 60mm" and "Series 63" are neither a
 * thread nor a diameter in the same sense, so they are left unrecorded rather
 * than written into filter_size_mm as if they were.
 */
function parseFilterSize(text) {
  if (isBlank(text)) return null;
  const v = String(text);
  if (/bayonet|series/i.test(v)) return null;
  const m = v.match(/(\d+(?:\.\d+)?)\s*mm/i);
  return m ? Number(m[1]) : null;
}

/** "0.3m", "1m" */
function parseMfd(text) {
  if (isBlank(text)) return null;
  const m = String(text).replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*m\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * The lens designation with its spec fragment removed: "KONICA HEXANON
 * 1:2.8 f=38mm" becomes "KONICA HEXANON". A few plates carry only the spec
 * ("1:2.8 45mm"), which leaves nothing and falls back to the camera name.
 */
function parseDesignation(text) {
  return text
    // The combined German form first, so stripping the ratio alone cannot
    // leave the focal length behind as a stray "/80".
    .replace(/1\s*:\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*(?:mm)?/g, " ")
    .replace(/1\s*:\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?/g, " ")
    .replace(/f\s*=\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)/gi, " ")
    .replace(/(?:^|\s)\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*(?:mm)?/gi, " ")
    .replace(/(?:^|\s)\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)\b/gi, " ")
    .replace(/\bF[:/]?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\b/gi, " ")
    .replace(/\bZOOM LENS\b/gi, " ")
    .replace(/\bLENS\b/gi, " ")
    // The plate carries the full company name; the lens is the Fujinon.
    .replace(/\bPHOTO\s+FILM(\s+CO\.?)?/gi, " ")
    // "Sonnar 2.3/40 Made by Rollei" is a sentence, not a designation.
    .replace(/\bMade\s+by\s+\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The booklets are set in capitals. Lower-casing a long all-caps word reads as
 * a name ("HEXANON" to "Hexanon") while short ones are initialisms that must
 * survive intact (EBC, GF, T*, S, W).
 */
function titleCase(designation) {
  // "SUPER-EBC" is two parts with different fates, so each side of a hyphen is
  // judged on its own: "Super" is a word, "EBC" is an initialism.
  const casePart = (part) => {
    const letters = part.replace(/[^A-Za-z]/g, "");
    if (letters.length < 4) return part;
    if (!/^[A-Za-z][A-Za-z.']*$/.test(part)) return part;
    if (part !== part.toUpperCase() && part !== part.toLowerCase()) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  };
  return designation
    .split(" ")
    .map((word) => (word === "CO." ? "Co." : word.split("-").map(casePart).join("-")))
    .join(" ");
}

function buildLensName(designation, focal, aperture) {
  const parts = [];
  if (designation) parts.push(designation);
  if (focal) {
    parts.push(focal.min === focal.max ? `${focal.min}mm` : `${focal.min}-${focal.max}mm`);
  }
  if (aperture) {
    // The catalogue writes the speed with a capital F.
    parts.push(
      aperture.min === aperture.max
        ? `F/${aperture.min}`
        : `F/${aperture.min}-${aperture.max}`,
    );
  }
  return parts.join(" ").trim();
}

/**
 * The maker as the plate spells it is not always the maker as the catalogue
 * files it: Leitz lenses are filed under Leica, Konishiroku under Konica. Only
 * names that cannot be matched against an existing brand need an entry here.
 */
const BRAND_ALIASES = [
  [/\bLeitz\b/i, "Leica"],
  [/\bKonishiroku\b/i, "Konica"],
  [/Fujinon/i, "Fuji"],
  [/\bRikenon\b/i, "Ricoh"],
  [/\bHexanon\b|\bHexar\b/i, "Konica"],
];

/** Brands are free text on the lens row, so reuse one already in the table. */
function deriveBrand(original, catalogueBrands) {
  // Aliases first: "Leitz" and "Konishiroku" survive as brand values on a
  // handful of rows, but the catalogue files those lenses under Leica (257
  // rows against 18) and Konica, and a backfill should not widen the split.
  for (const [pattern, brand] of BRAND_ALIASES) {
    if (pattern.test(original)) return brand;
  }
  for (const brand of catalogueBrands) {
    const pattern = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(original)) return brand;
  }
  return null;
}

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Compare names ignoring case, punctuation and word order noise. */
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sql = createSql();

const cameras = await sql`
  SELECT id, name, slug, system_id, year_introduced, specs
  FROM cameras
  WHERE specs ? 'Lens construction' AND merged_into_id IS NULL
  ORDER BY name`;

// Longest first, so "Carl Zeiss" wins over a bare "Zeiss" substring.
const catalogueBrands = (
  await sql`SELECT DISTINCT brand FROM lenses WHERE brand IS NOT NULL AND merged_into_id IS NULL`
)
  .map((r) => r.brand)
  .sort((a, b) => b.length - a.length);

const drafts = [];
const skipped = [];

for (const camera of cameras) {
  const specs = camera.specs ?? {};
  const original = normalizeOriginalName(specs["Original name"] ?? "");
  if (!original) {
    skipped.push({ camera, reason: "no Original name" });
    continue;
  }

  const focal = parseFocal(original) ?? parseFocal(String(specs["Focal length"] ?? ""));
  const aperture = parseAperture(original, specs["Speed"]);
  if (!focal || !aperture) {
    skipped.push({
      camera,
      reason: `unparsed (focal=${focal ? focal.min : "?"} aperture=${aperture ? aperture.min : "?"}) from "${original}"`,
    });
    continue;
  }

  // A few plates carry only the spec ("1:2.8 45mm") and name no lens at all,
  // which leaves the camera as the only thing it can honestly be called after.
  const designation = titleCase(parseDesignation(original)) || camera.name;
  const { elements, groups } = parseConstruction(specs["Lens construction"]);
  const name = buildLensName(designation, focal, aperture);
  const isZoom = focal.min !== focal.max;

  drafts.push({
    camera,
    original,
    lens: {
      name,
      focalLengthMin: focal.min,
      focalLengthMax: focal.max,
      apertureMin: aperture.min,
      apertureMax: aperture.max,
      lensElements: elements,
      lensGroups: groups,
      filterSizeMm: parseFilterSize(specs["Filters"]),
      minFocusDistanceM: parseMfd(specs["Closest focusing distance"]),
      isZoom,
      isPrime: !isZoom,
      hasAutofocus: false,
      brand: deriveBrand(original, catalogueBrands),
      yearIntroduced: camera.year_introduced ?? null,
      description:
        `The non-removable lens of the ${camera.name}. Recorded on the camera's ` +
        `original specification as "${original}".`,
    },
  });
}

// Cameras fitted with the same lens share one row.
const groupsByKey = new Map();
for (const draft of drafts) {
  const key = [
    nameKey(draft.lens.name),
    draft.lens.lensElements ?? "?",
    draft.lens.lensGroups ?? "?",
  ].join("|");
  if (!groupsByKey.has(key)) groupsByKey.set(key, { lens: draft.lens, cameras: [] });
  groupsByKey.get(key).cameras.push(draft.camera);
}

// A lens already in the catalogue is linked, not duplicated.
const existing = await sql`
  SELECT id, name, slug, system_id, focal_length_min, aperture_min
  FROM lenses WHERE merged_into_id IS NULL`;
const existingByName = new Map();
for (const lens of existing) {
  const key = nameKey(lens.name);
  if (!existingByName.has(key)) existingByName.set(key, lens);
}

const plan = [...groupsByKey.values()].map((group) => ({
  ...group,
  match: existingByName.get(nameKey(group.lens.name)) ?? null,
}));

// Two lenses can share a designation and still be different computations: the
// Biogon 38mm f/4.5 is 9 elements on the SWA and 8 on the SWC, and the Leitz
// Anastigmat 50mm f/3.5 is 4 on the 0-Serie and 5 on the Model A. They must
// not collapse onto one slug, and the element count is the real difference.
const byName = new Map();
for (const p of plan) {
  const key = nameKey(p.lens.name);
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(p);
}
for (const collisions of byName.values()) {
  if (collisions.length < 2) continue;
  // One of them may already match a catalogue lens under that exact name; that
  // one keeps it, and the others are the ones that need distinguishing.
  for (const p of collisions) {
    if (p.match || !p.lens.lensElements) continue;
    p.lens.name = `${p.lens.name} (${p.lens.lensElements} elements)`;
  }
}

const toCreate = plan.filter((p) => !p.match);
const toLink = plan.filter((p) => p.match);

console.log(`${cameras.length} cameras carry a built-in lens spec`);
console.log(`${drafts.length} parsed, ${skipped.length} skipped`);
console.log(`${plan.length} distinct lenses: ${toCreate.length} new, ${toLink.length} already in the catalogue\n`);

console.log("=== NEW LENS ROWS ===");
for (const p of toCreate) {
  const l = p.lens;
  console.log(
    `\n  ${l.name}\n` +
      `    slug=${slugify(l.name)}\n` +
      `    focal=${l.focalLengthMin}-${l.focalLengthMax} aperture=f/${l.apertureMin}-${l.apertureMax} ` +
      `elements=${l.lensElements}/${l.lensGroups} filter=${l.filterSizeMm} mfd=${l.minFocusDistanceM} zoom=${l.isZoom}\n` +
      `    brand=${l.brand ?? "(none)"}\n` +
      `    on: ${p.cameras.map((c) => c.name).join(", ")}`,
  );
}

if (toLink.length) {
  console.log("\n=== LINKED TO EXISTING LENSES ===");
  for (const p of toLink) {
    console.log(
      `  ${p.lens.name}  ->  #${p.match.id} ${p.match.name} (system_id=${p.match.system_id})\n` +
        `    on: ${p.cameras.map((c) => c.name).join(", ")}`,
    );
  }
}

if (skipped.length) {
  console.log("\n=== SKIPPED ===");
  for (const s of skipped) console.log(`  ${s.camera.name}: ${s.reason}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  await sql.end();
  process.exit(0);
}

let created = 0;
let linked = 0;
await sql.unsafe("BEGIN");
try {
  for (const p of plan) {
    let lensId = p.match?.id ?? null;

    if (!lensId) {
      const l = p.lens;
      // Slugs are unique. A clash here is a lens this script did not recognise
      // as the same one, so stop rather than quietly point a camera at a lens
      // nobody checked.
      const base = slugify(l.name);
      const clash = await sql`SELECT id, name FROM lenses WHERE slug = ${base}`;
      if (clash.length) {
        throw new Error(
          `slug "${base}" for "${l.name}" is already held by lens #${clash[0].id} "${clash[0].name}"`,
        );
      }
      {
        const inserted = await sql`
          INSERT INTO lenses (
            name, slug, system_id, brand, description, lens_type,
            focal_length_min, focal_length_max, aperture_min, aperture_max,
            filter_size_mm, min_focus_distance_m, lens_elements, lens_groups,
            year_introduced, is_zoom, is_prime, has_autofocus, verified
          ) VALUES (
            ${l.name}, ${base}, NULL, ${l.brand}, ${l.description}, ${l.isZoom ? "Zoom lens" : "Prime lens"},
            ${l.focalLengthMin}, ${l.focalLengthMax}, ${l.apertureMin}, ${l.apertureMax},
            ${l.filterSizeMm}, ${l.minFocusDistanceM}, ${l.lensElements}, ${l.lensGroups},
            ${l.yearIntroduced}, ${l.isZoom}, ${l.isPrime}, false, true
          ) RETURNING id`;
        lensId = inserted[0].id;
        created += 1;
      }
    }

    for (const camera of p.cameras) {
      await sql`UPDATE cameras SET built_in_lens_id = ${lensId} WHERE id = ${camera.id}`;
      linked += 1;
    }
  }
  await sql.unsafe("COMMIT");
} catch (error) {
  await sql.unsafe("ROLLBACK");
  throw error;
}

console.log(`\nApplied: ${created} lenses created, ${linked} cameras linked.`);
await sql.end();
