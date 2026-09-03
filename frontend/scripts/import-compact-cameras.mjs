/**
 * The 1980s and 1990s compact cameras, with their built-in lenses.
 *
 * The catalogue inherited its cameras from lens-db.com, which documented
 * interchangeable-lens systems. That left the autofocus compact of the 80s and
 * 90s missing entirely: no L35AF, no mju, no T2, no GR1, though these are the
 * cameras people search for most in the category. Until migration 0038 there
 * was also nowhere to put their lenses, because a body with no mount could not
 * record one.
 *
 * Every specification here was read off camera-wiki.org, whose page is stored
 * on the camera row as `url`. Fields the source does not state are left null
 * rather than guessed, which is why some rows carry no weight and the Yashica
 * T4 Super carries no year. Nothing in this file is from memory.
 *
 * The built-in lens gets its own row, as for every other fixed-lens body. Where
 * the obvious lens name is already taken by an interchangeable lens of the same
 * designation and speed (the OM-mount Zuiko 35mm f/2.8 is not the XA's), the
 * camera model disambiguates it.
 *
 * Usage (from frontend/):
 *   node scripts/import-compact-cameras.mjs            # dry run
 *   node scripts/import-compact-cameras.mjs --apply    # write
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

const WIKI = "https://camera-wiki.org/wiki/";

/**
 * name       camera as the maker styled it
 * alias      the same camera sold under another name, or its nickname
 * year       year of introduction, null when the source does not state one
 * weightG    body weight, null when not stated
 * lens       designation, focal, aperture, elements, groups, mfd, filter
 * source     camera-wiki page the values were read from
 */
const CAMERAS = [
  {
    name: "Nikon L35AF",
    alias: "Nikon L35AD, Pikaichi",
    year: 1983,
    weightG: null,
    source: "Nikon_L35AF",
    lens: { brand: "Nikon", designation: "Nikon Nikkor", focal: 35, aperture: 2.8, elements: 5, groups: 4, mfd: 0.8, filter: 46 },
  },
  {
    name: "Olympus XA",
    alias: null,
    year: 1979,
    weightG: null,
    source: "Olympus_XA2",
    lens: { brand: "Olympus", designation: "Olympus Zuiko", focal: 35, aperture: 2.8, elements: 6, groups: null, mfd: 0.85, filter: null },
  },
  {
    name: "Olympus XA2",
    alias: null,
    year: 1980,
    weightG: null,
    source: "Olympus_XA2",
    lens: { brand: "Olympus", designation: "Olympus Zuiko", focal: 35, aperture: 3.5, elements: 4, groups: 4, mfd: null, filter: null },
  },
  {
    name: "Olympus XA1",
    alias: null,
    year: 1982,
    weightG: null,
    source: "Olympus_XA2",
    lens: { brand: "Olympus", designation: "Olympus Zuiko", focal: 35, aperture: 4, elements: 4, groups: null, mfd: 1.5, filter: null },
  },
  {
    name: "Olympus XA3",
    alias: null,
    year: 1985,
    weightG: null,
    source: "Olympus_XA2",
    lens: { brand: "Olympus", designation: "Olympus Zuiko", focal: 35, aperture: 3.5, elements: null, groups: null, mfd: 1.2, filter: null },
  },
  {
    name: "Olympus XA4",
    alias: null,
    year: 1985,
    weightG: null,
    source: "Olympus_XA2",
    lens: { brand: "Olympus", designation: "Olympus Zuiko", focal: 28, aperture: 3.5, elements: 5, groups: null, mfd: 0.3, filter: null },
  },
  {
    name: "Olympus AF-1",
    alias: "Olympus Infinity, Nurepika",
    year: 1986,
    weightG: null,
    source: "Olympus_AF-1",
    lens: { brand: "Olympus", designation: "Olympus", focal: 35, aperture: 2.8, elements: null, groups: null, mfd: 0.75, filter: null },
  },
  {
    name: "Olympus mju",
    alias: "Olympus Infinity Stylus",
    year: 1991,
    weightG: null,
    source: "Olympus_mju",
    lens: { brand: "Olympus", designation: "Olympus", focal: 35, aperture: 3.5, elements: 3, groups: 3, mfd: null, filter: null },
  },
  {
    name: "Olympus mju II",
    alias: "Olympus Infinity Stylus Epic",
    year: 1997,
    weightG: 135,
    source: "Olympus_mju_II",
    lens: { brand: "Olympus", designation: "Olympus", focal: 35, aperture: 2.8, elements: 4, groups: 4, mfd: 0.35, filter: null },
  },
  {
    name: "Canon AF35M",
    alias: "Canon Sure Shot, Canon Autoboy",
    year: 1979,
    weightG: null,
    source: "Canon_AF35M",
    lens: { brand: "Canon", designation: "Canon", focal: 38, aperture: 2.8, elements: 4, groups: 3, mfd: null, filter: null },
  },
  {
    name: "Contax T",
    alias: null,
    year: 1984,
    weightG: 270,
    source: "Contax_T",
    lens: { brand: "Carl Zeiss", designation: "Carl Zeiss Sonnar", focal: 38, aperture: 2.8, elements: 5, groups: 4, mfd: 1, filter: null },
  },
  {
    name: "Contax T2",
    alias: null,
    year: 1991,
    weightG: 295,
    source: "Contax_T2",
    lens: { brand: "Carl Zeiss", designation: "Carl Zeiss Sonnar T*", focal: 38, aperture: 2.8, elements: 5, groups: 4, mfd: 0.7, filter: null },
  },
  {
    name: "Yashica T3",
    alias: "Kyocera T Scope",
    year: 1987,
    weightG: null,
    source: "Yashica_T3",
    lens: { brand: "Carl Zeiss", designation: "Carl Zeiss T*", focal: 35, aperture: 2.8, elements: null, groups: null, mfd: null, filter: null },
  },
  {
    name: "Yashica T4",
    alias: "Kyocera Slim T",
    year: 1994,
    weightG: 170,
    source: "Yashica_T4",
    lensKey: "zeiss-tessar-35-t4",
    lens: { brand: "Carl Zeiss", designation: "Carl Zeiss Tessar", focal: 35, aperture: 3.5, elements: 4, groups: 3, mfd: null, filter: null },
  },
  {
    name: "Yashica T4 Super",
    alias: "Yashica T5, Kyocera T Proof",
    year: null,
    weightG: null,
    source: "Yashica_T5",
    lensKey: "zeiss-tessar-35-t4",
    lens: { brand: "Carl Zeiss", designation: "Carl Zeiss Tessar", focal: 35, aperture: 3.5, elements: null, groups: null, mfd: null, filter: null },
  },
  {
    name: "Ricoh GR1",
    alias: null,
    year: 1996,
    weightG: 175,
    source: "Ricoh_GR1",
    lensKey: "ricoh-gr-28",
    lens: { brand: "Ricoh", designation: "Ricoh GR", focal: 28, aperture: 2.8, elements: 7, groups: 4, mfd: null, filter: null },
  },
  {
    name: "Ricoh GR1s",
    alias: null,
    year: 1998,
    weightG: null,
    source: "Ricoh_GR1s",
    lensKey: "ricoh-gr-28",
    lens: { brand: "Ricoh", designation: "Ricoh GR", focal: 28, aperture: 2.8, elements: 7, groups: 4, mfd: 0.35, filter: null },
  },
  {
    name: "Minolta TC-1",
    alias: null,
    year: 1996,
    weightG: null,
    source: "Minolta_TC-1",
    lens: { brand: "Minolta", designation: "Minolta G-Rokkor", focal: 28, aperture: 3.5, elements: 5, groups: 5, mfd: null, filter: null },
  },
  {
    name: "Nikon 35Ti",
    alias: null,
    year: 1993,
    weightG: null,
    source: "Nikon_35Ti",
    lens: { brand: "Nikon", designation: "Nikon Nikkor", focal: 35, aperture: 2.8, elements: null, groups: null, mfd: null, filter: null },
  },
  {
    name: "Nikon 28Ti",
    alias: null,
    year: 1994,
    weightG: null,
    source: "Nikon_28Ti",
    lens: { brand: "Nikon", designation: "Nikon Nikkor", focal: 28, aperture: 2.8, elements: 7, groups: 5, mfd: 0.4, filter: null },
  },
  {
    name: "Leica Minilux",
    alias: null,
    year: 1995,
    weightG: 330,
    source: "Leica_Minilux",
    lens: { brand: "Leica", designation: "Leica Summarit", focal: 40, aperture: 2.4, elements: 6, groups: 4, mfd: null, filter: null },
  },
  {
    name: "Konica Big Mini BM-201",
    alias: null,
    year: 1990,
    weightG: 188,
    source: "Konica_Big_Mini_BM-201",
    lens: { brand: "Konica", designation: "Konica", focal: 35, aperture: 3.5, elements: 4, groups: 4, mfd: 0.35, filter: null },
  },
  {
    name: "Pentax Espio Mini",
    alias: "Pentax UC-1",
    year: 1994,
    weightG: 155,
    source: "Pentax_Espio_Mini",
    lens: { brand: "Pentax", designation: "Pentax", focal: 32, aperture: 3.5, elements: 3, groups: 3, mfd: 0.3, filter: null },
  },
];

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Camera slugs on this site carry the year, as "konica-c35-1968". */
const cameraSlug = (c) => (c.year ? slugify(`${c.name} ${c.year}`) : slugify(c.name));

const sql = createSql();

const existingCameraSlugs = new Set(
  (await sql`SELECT slug FROM cameras`).map((r) => r.slug),
);
const existingLensRows = await sql`SELECT name, slug FROM lenses`;
const existingLensSlugs = new Set(existingLensRows.map((r) => r.slug));

/**
 * Older rows were slugged as "ricoh-gr-28mm-f28-1998", so a slug comparison
 * misses that "Ricoh GR 28mm F/2.8" is already in the catalogue. Compare the
 * names instead, ignoring case and punctuation.
 */
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const existingLensNames = new Set(existingLensRows.map((r) => nameKey(r.name)));

// Bodies that share one lens share one row. The GR1 and GR1s carry the same
// GR 28mm f/2.8, and the T4 and T4 Super the same Tessar; the XA2 and XA3 only
// look alike, since the source says "similar to", so they stay apart.
const groups = [];
const byKey = new Map();
for (const c of CAMERAS) {
  const key = c.lensKey ?? null;
  if (key && byKey.has(key)) {
    const group = byKey.get(key);
    group.cameras.push(c);
    // Keep the fullest reading of the shared lens.
    for (const field of ["elements", "groups", "mfd", "filter"]) {
      if (group.lens[field] == null) group.lens[field] = c.lens[field];
    }
    continue;
  }
  const group = { lens: { ...c.lens }, cameras: [c] };
  if (key) byKey.set(key, group);
  groups.push(group);
}

// The catalogue writes the speed with a capital F (8,607 rows against 94).
const baseName = (lens) => `${lens.designation} ${lens.focal}mm F/${lens.aperture}`;

// A name shared with an interchangeable lens, or with another group, is
// disambiguated on every side rather than only the second one, so no row
// silently claims to be the plain version.
const nameCounts = new Map();
for (const g of groups) {
  const k = slugify(baseName(g.lens));
  nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
}
for (const g of groups) {
  const base = baseName(g.lens);
  const clashesInBatch = (nameCounts.get(slugify(base)) ?? 0) > 1;
  const clashesWithCatalogue =
    existingLensSlugs.has(slugify(base)) || existingLensNames.has(nameKey(base));
  // "Nikon Nikkor 35mm f/2.8 (Nikon L35AF)" says Nikon twice; the model alone
  // is what distinguishes it.
  const model = g.cameras[0].name.startsWith(`${g.lens.brand} `)
    ? g.cameras[0].name.slice(g.lens.brand.length + 1)
    : g.cameras[0].name;
  g.name =
    clashesInBatch || clashesWithCatalogue ? `${base} (${model})` : base;
}

const plan = [];
const skipped = [];

for (const g of groups) {
  if (existingLensSlugs.has(slugify(g.name))) {
    skipped.push(`${g.cameras.map((c) => c.name).join(", ")}: lens slug "${slugify(g.name)}" is taken`);
    continue;
  }
  const cameras = [];
  for (const c of g.cameras) {
    const slug = cameraSlug(c);
    if (existingCameraSlugs.has(slug)) {
      skipped.push(`${c.name}: a camera already holds the slug "${slug}"`);
      continue;
    }
    existingCameraSlugs.add(slug);
    cameras.push({ camera: c, slug });
  }
  if (cameras.length === 0) continue;
  existingLensSlugs.add(slugify(g.name));
  plan.push({ lensNameValue: g.name, lens: g.lens, cameras });
}

const cameraTotal = plan.reduce((n, p) => n + p.cameras.length, 0);

console.log(
  `${CAMERAS.length} compacts defined, ${cameraTotal} cameras and ${plan.length} lenses to import, ${skipped.length} skipped\n`,
);
for (const p of plan) {
  const l = p.lens;
  console.log(
    `  ${p.lensNameValue}  [${l.brand}]\n` +
      `      slug=${slugify(p.lensNameValue)} elements=${l.elements ?? "-"}/${l.groups ?? "-"}` +
      ` mfd=${l.mfd ?? "-"} filter=${l.filter ?? "-"}\n` +
      p.cameras
        .map(
          (x) =>
            `      -> ${x.camera.name}${x.camera.year ? ` (${x.camera.year})` : " (year not stated)"}` +
            `  ${x.slug}  ${WIKI}${x.camera.source}`,
        )
        .join("\n"),
  );
}
if (skipped.length) {
  console.log("\n=== SKIPPED ===");
  for (const s of skipped) console.log(`  ${s}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  await sql.end();
  process.exit(0);
}

let lensesCreated = 0;
let camerasCreated = 0;
await sql.unsafe("BEGIN");
try {
  for (const p of plan) {
    const l = p.lens;
    const lensSlug = slugify(p.lensNameValue);
    const bodies = p.cameras.map((x) => x.camera.name).join(", ");
    const firstSource = WIKI + p.cameras[0].camera.source;
    const earliestYear = p.cameras
      .map((x) => x.camera.year)
      .filter((y) => y != null)
      .sort((a, b) => a - b)[0] ?? null;

    const [lens] = await sql`
      INSERT INTO lenses (
        name, slug, system_id, brand, description, lens_type,
        focal_length_min, focal_length_max, aperture_min, aperture_max,
        filter_size_mm, min_focus_distance_m, lens_elements, lens_groups,
        year_introduced, is_zoom, is_prime, has_autofocus, verified, url
      ) VALUES (
        ${p.lensNameValue}, ${lensSlug}, NULL, ${l.brand},
        ${`The non-removable lens of the ${bodies}.`}, 'Prime lens',
        ${l.focal}, ${l.focal}, ${l.aperture}, ${l.aperture},
        ${l.filter}, ${l.mfd}, ${l.elements}, ${l.groups},
        ${earliestYear}, false, true, false, true, ${firstSource}
      ) RETURNING id`;
    lensesCreated += 1;

    for (const { camera: c, slug } of p.cameras) {
      await sql`
        INSERT INTO cameras (
          name, slug, alias, url, system_id, built_in_lens_id,
          body_type, sensor_size, year_introduced, weight_g, specs, verified
        ) VALUES (
          ${c.name}, ${slug}, ${c.alias}, ${WIKI + c.source}, NULL, ${lens.id},
          'Compact', '35mm full frame', ${c.year}, ${c.weightG},
          ${JSON.stringify({ "Film type": "135 cartridge-loaded film", Source: WIKI + c.source })}::jsonb,
          true
        )`;
      camerasCreated += 1;
    }
  }
  await sql.unsafe("COMMIT");
} catch (error) {
  await sql.unsafe("ROLLBACK");
  throw error;
}

console.log(`\nApplied: ${camerasCreated} cameras and ${lensesCreated} built-in lenses created.`);
await sql.end();
