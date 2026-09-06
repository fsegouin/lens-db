/**
 * The interchangeable-lens digital bodies LibRaw supports and we did not have.
 *
 * scan-libraw-gaps.mjs finds these; LibRaw itself gives only a model string, so
 * every figure below was looked up rather than derived from the scan. The
 * sources are named per group in the comments and recorded as a field_citation
 * on each row, so a value here can be traced to where it was read.
 *
 * Fields the source does not state are left null rather than guessed, which is
 * why several rows carry a year and nothing else. Where a monochrome variant is
 * documented only through its colour sibling, the figure is taken from the
 * sibling and the citation says so.
 *
 * Not everything the scanner reported is here. The three GXR "Ricoh Lens" units
 * are a fixed lens and sensor in one module, so they are compacts by any other
 * name and out of scope for the same reason the X100 is; only the M-mount GXR
 * Mount A12 is a body that takes lenses.
 *
 * Usage (from frontend/):
 *   node scripts/import-libraw-cameras.mjs           # dry run
 *   node scripts/import-libraw-cameras.mjs --apply   # write
 */

import { createSql } from "./lib/db.mjs";
import { buildIndex, lookup } from "./lib/catalogue-match.mjs";

const apply = process.argv.slice(2).includes("--apply");

const KODAK_DCS = "https://en.wikipedia.org/wiki/Kodak_DCS";
const HASSELBLAD = "https://en.wikipedia.org/wiki/Hasselblad";
const DPREVIEW_VG = "https://www.dpreview.com/articles/1680034743/sony-nex-vg900-full-frame-camcorder-and-vg-30-aps-c-model-and-18-200-power-zoom-lens";
const DPREVIEW_VG20 = "https://www.dpreview.com/articles/7513005306/sonynexvg20";
const DPREVIEW_GXR = "https://www.dpreview.com/reviews/ricohgxrmounta12";
const DPREVIEW_DMR = "https://www.dpreview.com/articles/4888226123/leicadigitalr9";
const WIKI_RD175 = "https://en.wikipedia.org/wiki/Minolta_RD-175";
const DPREVIEW_ZENIT = "https://www.dpreview.com/news/9034303849/photokina-2018-hands-on-with-zenit-m";

/**
 * name         as LibRaw writes it, which is also how the row is named
 * year         year of introduction
 * mp           effective megapixels
 * sensorSize   as the source gives it
 * mount        must match a `systems` row by name, or be null
 * source       where the figures were read
 * note         anything that qualifies them, e.g. a figure taken from a sibling
 */
const CAMERAS = [
  // Kodak's professional DSLRs, all from the model table in the Wikipedia
  // article, which gives year, resolution, sensor size and host body.
  { name: "Kodak DCS315C", year: 1998, mp: 1.5, sensorSize: "13.7 x 9.1 mm", mount: "Nikon F", source: KODAK_DCS },
  { name: "Kodak DCS330C", year: 1999, mp: 3, sensorSize: "18.1 x 13.5 mm", mount: "Nikon F", source: KODAK_DCS },
  { name: "Kodak DCS520C", year: 1998, mp: 2, sensorSize: "22.5 x 15 mm", mount: "Canon EF", source: KODAK_DCS },
  { name: "Kodak DCS560C", year: 1998, mp: 6, sensorSize: "27.4 x 18.1 mm", mount: "Canon EF", source: KODAK_DCS },
  { name: "Kodak DCS620C", year: 1999, mp: 2, sensorSize: "22.5 x 15 mm", mount: "Nikon F", source: KODAK_DCS },
  { name: "Kodak DCS660C", year: 1999, mp: 6, sensorSize: "27.4 x 18.1 mm", mount: "Nikon F", source: KODAK_DCS },
  { name: "Kodak DCS760C", year: 2001, mp: 6, sensorSize: "27.4 x 18.1 mm", mount: "Nikon F", source: KODAK_DCS },
  { name: "Kodak EOSDCS1", year: 1995, mp: 6, sensorSize: "27.5 x 18.3 mm", mount: "Canon EF", source: KODAK_DCS },
  { name: "Kodak EOSDCS3", year: 1995, mp: 1.3, sensorSize: "20.5 x 16.4 mm", mount: "Canon EF", source: KODAK_DCS },
  { name: "Kodak DCS Pro 14nx", year: 2002, mp: 14, sensorSize: "36 x 24 mm", mount: "Nikon F", source: KODAK_DCS },

  // The monochrome variants are not listed separately by the source; each takes
  // its figures from the colour model of the same number, which the source does
  // list. The citation note records that.
  { name: "Kodak DCS460M", year: 1994, mp: 6, sensorSize: "27.5 x 18.3 mm", mount: "Nikon F", source: KODAK_DCS, note: "Monochrome variant; figures from the DCS 460 (1994) in the same table." },
  { name: "Kodak DCS660M", year: 1999, mp: 6, sensorSize: "27.4 x 18.1 mm", mount: "Nikon F", source: KODAK_DCS, note: "Monochrome variant; figures from the DCS 660c (1999) in the same table." },
  { name: "Kodak DCS760M", year: 2001, mp: 6, sensorSize: "27.4 x 18.1 mm", mount: "Nikon F", source: KODAK_DCS, note: "Monochrome variant; figures from the DCS 760c (2001) in the same table." },

  // Kodak's medium-format backs. The Pro Back 645 shipped in three mounts, which
  // is what the C, H and M suffixes are.
  { name: "Kodak ProBack", year: 2000, mp: 16, sensorSize: "36.7 x 36.7 mm", mount: "Hasselblad V", source: KODAK_DCS },
  { name: "Kodak PB645C", year: 2002, mp: 16, sensorSize: "36.7 x 36.7 mm", mount: "Contax 645", source: KODAK_DCS, note: "DCS Pro Back 645, Contax 645 mount." },
  { name: "Kodak PB645H", year: 2002, mp: 16, sensorSize: "36.7 x 36.7 mm", mount: "Hasselblad H", source: KODAK_DCS, note: "DCS Pro Back 645, Hasselblad H1 mount." },
  { name: "Kodak PB645M", year: 2002, mp: 16, sensorSize: "36.7 x 36.7 mm", mount: "Mamiya M645", source: KODAK_DCS, note: "DCS Pro Back 645, Mamiya 645 mount." },

  // The H system. The source gives a year per generation and the resolutions
  // each was offered in; the number after the dash is that resolution, which is
  // how Hasselblad names them.
  { name: "Hasselblad H2D-22", year: 2004, mp: 22, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H2D-39", year: 2004, mp: 39, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3D-22", year: 2007, mp: 22, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3D-31", year: 2007, mp: 31, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3D-39", year: 2007, mp: 39, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3DII-22", year: 2007, mp: 22, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3DII-31", year: 2007, mp: 31, sensorSize: "33.1 x 44.2 mm", mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3DII-39", year: 2007, mp: 39, sensorSize: "36.8 x 49.0 mm", mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H3DII-50", year: 2007, mp: 50, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H4D-31", year: 2009, mp: 31, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H4D-40", year: 2009, mp: 40, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H4D-50", year: 2009, mp: 50, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H4D-60", year: 2009, mp: 60, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H5D-40", year: 2012, mp: 40, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H5D-50", year: 2012, mp: 50, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H5D-50c", year: 2012, mp: 50, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H5D-60", year: 2012, mp: 60, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad H6D-100c", year: 2016, mp: 100, sensorSize: "53.4 x 40.0 mm", mount: "Hasselblad H", source: HASSELBLAD },
  // The A6D is the aerial version of the H6D; the source names no year for it.
  { name: "Hasselblad A6D-100c", year: null, mp: 100, sensorSize: "53.4 x 40.0 mm", mount: "Hasselblad H", source: HASSELBLAD, note: "Aerial variant of the H6D-100c; the source gives no separate year." },

  // The backs. Years come from the source where it states one.
  { name: "Hasselblad CFH", year: 2004, mp: 22, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad CF-22", year: null, mp: 22, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad CF-31", year: null, mp: 31, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad CF-39", year: null, mp: 39, sensorSize: null, mount: "Hasselblad H", source: HASSELBLAD },
  { name: "Hasselblad CFV", year: null, mp: null, sensorSize: null, mount: "Hasselblad V", source: HASSELBLAD },
  { name: "Hasselblad CFV-50", year: null, mp: 50, sensorSize: null, mount: "Hasselblad V", source: HASSELBLAD },
  { name: "Hasselblad CFV-50c", year: 2014, mp: 50, sensorSize: "43.2 x 32.9 mm", mount: "Hasselblad V", source: HASSELBLAD },
  { name: "Hasselblad CFV II 50C", year: 2019, mp: 50, sensorSize: "43.2 x 32.9 mm", mount: "Hasselblad V", source: HASSELBLAD },
  { name: "Hasselblad CFV-100c", year: 2024, mp: 100, sensorSize: null, mount: "Hasselblad V", source: HASSELBLAD },
  { name: "Hasselblad V96C", year: null, mp: null, sensorSize: null, mount: "Hasselblad V", source: HASSELBLAD, note: "Ixpress back for the V system; the source gives no year." },

  // Sony's E-mount camcorders take the same lenses as the bodies, which is why
  // they are here at all.
  { name: "Sony NEX-VG20", year: 2011, mp: 16.1, sensorSize: "APS-C", mount: "Sony E", source: DPREVIEW_VG20 },
  { name: "Sony NEX-VG30", year: 2012, mp: 16.1, sensorSize: "APS-C", mount: "Sony E", source: DPREVIEW_VG },
  { name: "Sony NEX-VG900", year: 2012, mp: 24.3, sensorSize: "35mm full frame", mount: "Sony E", source: DPREVIEW_VG, note: "The first consumer full-frame interchangeable-lens camcorder." },

  { name: "Ricoh GXR Mount A12", year: 2011, mp: 12, sensorSize: "APS-C", mount: "Leica M", source: DPREVIEW_GXR, note: "The M-mount unit of the modular GXR; the other GXR units have a fixed lens." },
  { name: "Leica Digital-Modul-R", year: 2005, mp: 10, sensorSize: null, mount: "Leica R", source: DPREVIEW_DMR, note: "Digital back for the R8 and R9, made with Imacon." },
  { name: "Minolta RD-175", year: 1995, mp: 0.41, sensorSize: null, mount: null, source: WIKI_RD175, note: "Three CCDs behind a beam splitter. LibRaw lists it as \"Minolta RD175 / Agfa ActionCam\"." },
  { name: "Zenit M", year: 2018, mp: 24, sensorSize: "35mm full frame", mount: null, source: DPREVIEW_ZENIT, note: "Built with Leica on the M (Typ 240). Sources disagree on how to name the mount, so it is left unset." },

  // Reported by the scanner but left without figures: no source consulted here
  // states a year for them, and a variant's year is not safe to assume from the
  // model it is a variant of.
  { name: "FujiFilm X-T1 Graphite Silver", year: null, mp: null, sensorSize: null, mount: "Fujifilm X", source: null },
  { name: "Panasonic AG-GH4", year: null, mp: null, sensorSize: null, mount: "Micro Four Thirds", source: null },
  { name: "Panasonic DMC-GM1s", year: null, mp: null, sensorSize: null, mount: "Micro Four Thirds", source: null },
  { name: "Sony ILCE-QX1", year: null, mp: null, sensorSize: null, mount: "Sony E", source: null, note: "LibRaw lists it as \"Sony ILCE-QX1 / UMC-R10C\"." },
  { name: "Sony ILX-LR1", year: null, mp: null, sensorSize: null, mount: "Sony E", source: null },
  { name: "Fujifilm DBP for GX680", year: null, mp: null, sensorSize: null, mount: null, source: null, note: "Digital back for the GX680. LibRaw lists it as \"FujiFilm DBP for GX680 / DX-2000\"." },
];

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const sql = createSql();

const existing = await sql.unsafe("select id, name from cameras where merged_into_id is null");
const index = buildIndex(existing);
const takenSlugs = new Set((await sql.unsafe("select slug from cameras")).map((r) => r.slug));

const systems = await sql.unsafe("select id, name from systems");
const systemsByName = new Map(systems.map((s) => [s.name.toLowerCase(), s]));

const toInsert = [];
const skipped = [];
const badMounts = [];

for (const camera of CAMERAS) {
  if (lookup(index, camera.name)) {
    skipped.push(camera.name);
    continue;
  }
  // A mount that names no system is a mistake in the table above, not a reason
  // to write a row with a dangling reference.
  let systemId = null;
  if (camera.mount) {
    const system = systemsByName.get(camera.mount.toLowerCase());
    if (!system) {
      badMounts.push(`${camera.name}: no system named "${camera.mount}"`);
      continue;
    }
    systemId = system.id;
  }

  let slug = slugify(camera.name);
  if (takenSlugs.has(slug)) {
    let n = 2;
    while (takenSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  takenSlugs.add(slug);
  toInsert.push({ ...camera, slug, systemId });
}

if (badMounts.length) {
  console.error("Mounts that match no system:");
  for (const m of badMounts) console.error(`  ${m}`);
  console.error("Fix the table or add the system before running with --apply.\n");
}

console.log(`In the table:         ${CAMERAS.length}`);
console.log(`Already in catalogue: ${skipped.length}`);
console.log(`To insert:            ${toInsert.length}`);
console.log(`  with a year:        ${toInsert.filter((c) => c.year).length}`);
console.log(`  with megapixels:    ${toInsert.filter((c) => c.mp).length}`);
console.log(`  linked to a system: ${toInsert.filter((c) => c.systemId).length}`);
console.log("\nFirst 12:");
for (const c of toInsert.slice(0, 12)) {
  console.log(`  ${c.name.padEnd(32)}${String(c.year ?? "—").padEnd(6)}${String(c.mp ?? "—").padEnd(7)}${c.mount ?? "—"}`);
}

if (!apply) {
  console.log(`\nDry run. Nothing written. Pass --apply to insert ${toInsert.length} cameras.`);
  await sql.end();
  process.exit(badMounts.length ? 1 : 0);
}
if (badMounts.length) {
  console.error("Refusing to write while the table names systems that do not exist.");
  await sql.end();
  process.exit(1);
}

let inserted = 0;
for (const c of toInsert) {
  const [row] = await sql`
    INSERT INTO cameras (name, slug, url, year_introduced, megapixels, sensor_size, system_id)
    VALUES (${c.name}, ${c.slug}, ${c.source}, ${c.year}, ${c.mp}, ${c.sensorSize}, ${c.systemId})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (!row) continue;
  inserted++;

  if (!c.source) continue;
  const fields = [
    ["yearIntroduced", c.year],
    ["megapixels", c.mp],
    ["sensorSize", c.sensorSize],
    ["systemId", c.systemId],
  ].filter(([, value]) => value !== null && value !== undefined);

  for (const [field] of fields) {
    await sql`
      INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
      VALUES ('camera', ${row.id}, ${field}, ${new URL(c.source).hostname.replace(/^www\./, "")}, ${c.source}, ${c.note ?? null})
      ON CONFLICT (entity_type, entity_id, field) DO NOTHING
    `;
  }
}

console.log(`\nInserted ${inserted} cameras.`);
await sql.end();
