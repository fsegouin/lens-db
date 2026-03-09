#!/usr/bin/env node

import { neon } from "@neondatabase/serverless";

const SERIES_MATCH_RULES = [
  { slug: "canon-l", sql: `name ~ '[0-9]L' AND name ILIKE '%canon%'` },
  { slug: "sigma-art", sql: `name ILIKE '%sigma%' AND name LIKE '%| A'` },
  { slug: "sigma-contemporary", sql: `name ILIKE '%sigma%' AND name LIKE '%| C'` },
  { slug: "sigma-sports", sql: `name ILIKE '%sigma%' AND name LIKE '%| S'` },
  { slug: "sigma-dc", sql: `name ILIKE '%sigma%dc%'` },
  { slug: "sigma-dg", sql: `name ILIKE '%sigma%dg%'` },
  { slug: "sigma-xq-ys", sql: `name ILIKE '%sigma%' AND (name ILIKE '%xq%' OR name ILIKE '%ys%')` },
  { slug: "nikon-af-s-nikkor", sql: `name ILIKE '%nikon af-s nikkor%' OR name ILIKE '%af-s nikkor%'` },
  { slug: "nikon-af-p-nikkor", sql: `name ILIKE '%nikon af-p nikkor%' OR name ILIKE '%af-p nikkor%'` },
  { slug: "nikon-af-i-nikkor", sql: `name ILIKE '%nikon af-i nikkor%' OR name ILIKE '%af-i nikkor%'` },
  { slug: "nikon-af-nikkor", sql: `name ILIKE '%nikon af nikkor%' OR name ILIKE '%af nikkor%'` },
  { slug: "nikon-ai-s-nikkor", sql: `name ILIKE '%nikon ai-s nikkor%' OR name ILIKE '%ai-s nikkor%'` },
  { slug: "nikon-ai-nikkor", sql: `name ILIKE '%nikon ai nikkor%' OR name ILIKE '%ai nikkor%'` },
  { slug: "nikon-non-ai-nikkor", sql: `name ILIKE '%nikon non-ai nikkor%' OR name ILIKE '%non-ai nikkor%'` },
  { slug: "nikon-e", sql: `name ILIKE '%nikon series e%'` },
  { slug: "pentax-da-645", sql: `name ILIKE '%pentax-da 645%' OR name ILIKE '%smc pentax-da 645%'` },
  { slug: "pentax-d-fa-645", sql: `name ILIKE '%pentax-d fa 645%' OR name ILIKE '%smc pentax-d fa 645%'` },
  { slug: "pentax-fa-645", sql: `name ILIKE '%pentax-fa 645%' OR name ILIKE '%smc pentax-fa 645%'` },
  { slug: "pentax-a-645", sql: `name ILIKE '%pentax-a 645%' OR name ILIKE '%smc pentax-a 645%'` },
  { slug: "pentax-da", sql: `(name ILIKE '%pentax-da %' OR name ILIKE '%smc pentax-da %') AND name NOT ILIKE '%645%'` },
  { slug: "pentax-d-fa", sql: `(name ILIKE '%pentax-d fa %' OR name ILIKE '%smc pentax-d fa %') AND name NOT ILIKE '%645%'` },
  { slug: "pentax-fa", sql: `(name ILIKE '%pentax-fa %' OR name ILIKE '%smc pentax-fa %') AND name NOT ILIKE '%645%'` },
  { slug: "pentax-f", sql: `(name ILIKE '%pentax-f %' OR name ILIKE '%smc pentax-f %') AND name NOT ILIKE '%pentax-fa%'` },
  { slug: "pentax-a", sql: `(name ILIKE '%pentax-a %' OR name ILIKE '%smc pentax-a %') AND name NOT ILIKE '%pentax-a*%' AND name NOT ILIKE '%645%'` },
  { slug: "pentax-m", sql: `name ILIKE '%pentax-m %' OR name ILIKE '%smc pentax-m %'` },
  { slug: "pentax-limited", sql: `name ILIKE '%pentax%limited%'` },
  { slug: "pentax-star", sql: `name ILIKE '%pentax%' AND name LIKE '%*%'` },
  { slug: "tamron-sp", sql: `name ILIKE '%tamron sp%'` },
  { slug: "tamron-di-iii", sql: `name ILIKE '%tamron%di iii%'` },
  { slug: "tamron-di-ii", sql: `name ILIKE '%tamron%di ii%' AND name NOT ILIKE '%di iii%'` },
  { slug: "tamron-di", sql: `name ILIKE '%tamron%di %' AND name NOT ILIKE '%di ii%' AND name NOT ILIKE '%di iii%'` },
  { slug: "tamron-f", sql: `name ILIKE '%tamron-f %' OR name ILIKE '% tamron-f %'` },
  { slug: "tokina-at-x", sql: `name ILIKE '%tokina at-x%'` },
  { slug: "tokina-atx-i", sql: `name ILIKE '%tokina atx-i%'` },
  { slug: "tokina-atx-m", sql: `name ILIKE '%tokina atx-m%'` },
  { slug: "tokina-firin", sql: `name ILIKE '%tokina firin%'` },
  { slug: "tokina-opera", sql: `name ILIKE '%tokina opera%'` },
  { slug: "vivitar-series-1", sql: `name ILIKE '%vivitar series 1%'` },
  { slug: "takumar-bayonet", sql: `name ILIKE '%takumar bayonet%'` },
  { slug: "cosina-voigtlander-sl-sl-ii", sql: `name ILIKE '%voigtlander%sl%'` },
  { slug: "zeiss-batis", sql: `name ILIKE '%zeiss batis%'` },
  { slug: "zeiss-classic", sql: `name ILIKE '%zeiss classic%' OR (name ILIKE '%zeiss%' AND name ILIKE '%planar%') OR (name ILIKE '%zeiss%' AND name ILIKE '%distagon%') OR (name ILIKE '%zeiss%' AND name ILIKE '%makro-planar%')` },
  { slug: "zeiss-loxia", sql: `name ILIKE '%zeiss loxia%'` },
  { slug: "zeiss-milvus", sql: `name ILIKE '%zeiss milvus%'` },
  { slug: "zeiss-otus", sql: `name ILIKE '%zeiss otus%'` },
  { slug: "zeiss-touit", sql: `name ILIKE '%zeiss touit%'` },
];

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  const prefix = dryRun ? "[DRY RUN] " : "";

  console.log(`${prefix}Starting bad-slug migration...\n`);

  // Track summary stats
  let seriesCreated = 0;
  let membershipsCreated = 0;

  // ──────────────────────────────────────────────
  // Step 1: Delete URL garbage
  // ──────────────────────────────────────────────
  console.log("Step 1: Delete URL garbage entries...");
  const urlGarbage = await sql`SELECT id, slug FROM lenses WHERE slug LIKE 'http%'`;
  console.log(`  Found ${urlGarbage.length} URL garbage entries`);
  if (urlGarbage.length > 0 && !dryRun) {
    await sql`DELETE FROM lenses WHERE slug LIKE 'http%'`;
  }
  console.log(`  ${prefix}Deleted ${urlGarbage.length} entries\n`);

  // ──────────────────────────────────────────────
  // Step 2: Fix teleconverters
  // ──────────────────────────────────────────────
  console.log("Step 2: Fix teleconverter slugs...");
  const tcEntries = await sql`SELECT id, slug FROM lenses WHERE slug LIKE 'tc/%'`;
  console.log(`  Found ${tcEntries.length} teleconverter entries`);
  if (tcEntries.length > 0 && !dryRun) {
    await sql`UPDATE lenses SET slug = REPLACE(slug, 'tc/', ''), lens_type = 'teleconverter' WHERE slug LIKE 'tc/%'`;
  }
  console.log(`  ${prefix}Updated ${tcEntries.length} entries\n`);

  // ──────────────────────────────────────────────
  // Step 3: Delete matching system/ entries
  // ──────────────────────────────────────────────
  console.log("Step 3: Delete system/ entries that match existing systems...");
  const matchingSystems = await sql`
    SELECT l.id, l.slug
    FROM lenses l
    JOIN systems s ON s.slug = REPLACE(l.slug, 'system/', '')
    WHERE l.slug LIKE 'system/%'
  `;
  console.log(`  Found ${matchingSystems.length} matching system entries`);
  if (matchingSystems.length > 0 && !dryRun) {
    await sql`
      DELETE FROM lenses WHERE id IN (
        SELECT l.id FROM lenses l JOIN systems s ON s.slug = REPLACE(l.slug, 'system/', '') WHERE l.slug LIKE 'system/%'
      )
    `;
  }
  console.log(`  ${prefix}Deleted ${matchingSystems.length} entries\n`);

  // ──────────────────────────────────────────────
  // Step 4: Create missing systems, then delete remaining system/ and /full-list entries
  // ──────────────────────────────────────────────
  console.log("Step 4: Create missing systems from remaining system/ entries...");
  const remainingSystems = await sql`
    SELECT l.id, l.slug, l.name, l.description
    FROM lenses l
    WHERE l.slug LIKE 'system/%'
      AND l.slug NOT LIKE '%/full-list'
      AND NOT EXISTS (
        SELECT 1 FROM systems s WHERE s.slug = REPLACE(l.slug, 'system/', '')
      )
  `;
  console.log(`  Found ${remainingSystems.length} missing systems to create`);

  for (const row of remainingSystems) {
    const newSlug = row.slug.replace("system/", "");
    const cleanName = row.name
      .replace(/\s+system$/i, "")
      .trim();
    console.log(`  Creating system: ${cleanName} (${newSlug})`);
    if (!dryRun) {
      await sql`
        INSERT INTO systems (name, slug, description)
        VALUES (${cleanName}, ${newSlug}, ${row.description})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
  }
  seriesCreated += 0; // systems, not series

  // Delete ALL remaining system/ entries and /full-list entries
  const allSystemEntries = await sql`SELECT id FROM lenses WHERE slug LIKE 'system/%'`;
  const fullListEntries = await sql`SELECT id FROM lenses WHERE slug LIKE '%/full-list'`;
  console.log(`  Deleting ${allSystemEntries.length} remaining system/ entries`);
  console.log(`  Deleting ${fullListEntries.length} /full-list entries`);
  if (!dryRun) {
    await sql`DELETE FROM lenses WHERE slug LIKE 'system/%'`;
    await sql`DELETE FROM lenses WHERE slug LIKE '%/full-list'`;
  }
  console.log(`  ${prefix}Done\n`);

  // ──────────────────────────────────────────────
  // Step 5: Migrate cam/ to cameras
  // ──────────────────────────────────────────────
  console.log("Step 5: Migrate cam/ entries to cameras table...");
  const camEntries = await sql`
    SELECT id, name, slug, url, system_id, description, specs, images, year_introduced, weight_g
    FROM lenses
    WHERE slug LIKE 'cam/%'
  `;
  console.log(`  Found ${camEntries.length} cam/ entries`);

  let camerasInserted = 0;
  let camerasSkipped = 0;
  for (const row of camEntries) {
    const camSlug = row.slug.replace("cam/", "");
    const existing = await sql`
      SELECT id FROM cameras WHERE slug = ${camSlug} OR LOWER(name) = LOWER(${row.name})
    `;
    if (existing.length > 0) {
      camerasSkipped++;
      continue;
    }
    console.log(`  Inserting camera: ${row.name} (${camSlug})`);
    if (!dryRun) {
      await sql`
        INSERT INTO cameras (name, slug, url, system_id, description, specs, images, year_introduced, weight_g)
        VALUES (${row.name}, ${camSlug}, ${row.url}, ${row.system_id}, ${row.description}, ${JSON.stringify(row.specs)}, ${JSON.stringify(row.images)}, ${row.year_introduced}, ${row.weight_g})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    camerasInserted++;
  }
  console.log(`  Inserted ${camerasInserted}, skipped ${camerasSkipped} (already exist)`);

  if (!dryRun) {
    await sql`DELETE FROM lenses WHERE slug LIKE 'cam/%'`;
  }
  console.log(`  ${prefix}Deleted ${camEntries.length} cam/ entries from lenses\n`);

  // ──────────────────────────────────────────────
  // Step 6: Migrate series/ to lens_series
  // ──────────────────────────────────────────────
  console.log("Step 6: Migrate series/ entries to lens_series table...");
  const seriesEntries = await sql`
    SELECT id, name, slug, description
    FROM lenses
    WHERE slug LIKE 'series/%'
  `;
  console.log(`  Found ${seriesEntries.length} series/ entries`);

  for (const row of seriesEntries) {
    const seriesSlug = row.slug.replace("series/", "");
    const cleanName = row.name
      .replace(/\s+series\s+lenses$/i, "")
      .replace(/\s+series$/i, "")
      .trim();
    console.log(`  Inserting series: ${cleanName} (${seriesSlug})`);
    if (!dryRun) {
      await sql`
        INSERT INTO lens_series (name, slug, description)
        VALUES (${cleanName}, ${seriesSlug}, ${row.description})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    seriesCreated++;
  }

  if (!dryRun) {
    await sql`DELETE FROM lenses WHERE slug LIKE 'series/%'`;
  }
  console.log(`  ${prefix}Deleted ${seriesEntries.length} series/ entries from lenses\n`);

  // ──────────────────────────────────────────────
  // Step 7: Match lenses to series via name patterns
  // ──────────────────────────────────────────────
  console.log("Step 7: Match lenses to series via name patterns...");

  for (const rule of SERIES_MATCH_RULES) {
    // Look up series_id
    const seriesRows = await sql`SELECT id FROM lens_series WHERE slug = ${rule.slug}`;
    if (seriesRows.length === 0) {
      console.log(`  WARNING: Series '${rule.slug}' not found in lens_series, skipping`);
      continue;
    }
    const seriesId = seriesRows[0].id;

    // Find matching lenses using dynamic WHERE clause
    const matchingLenses = await sql.unsafe(
      `SELECT id FROM lenses WHERE slug NOT LIKE '%/%' AND (${rule.sql})`
    );

    if (matchingLenses.length === 0) {
      console.log(`  ${rule.slug}: 0 matches`);
      continue;
    }

    console.log(`  ${rule.slug}: ${matchingLenses.length} matches`);

    if (!dryRun) {
      for (const lens of matchingLenses) {
        await sql`
          INSERT INTO lens_series_memberships (lens_id, series_id)
          VALUES (${lens.id}, ${seriesId})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    membershipsCreated += matchingLenses.length;
  }

  console.log();

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  const remainingBad = await sql`SELECT COUNT(*) as count FROM lenses WHERE slug LIKE '%/%'`;
  const badCount = remainingBad[0].count;

  console.log("=== Summary ===");
  console.log(`${prefix}Remaining bad slugs (containing '/'): ${badCount}`);
  console.log(`${prefix}Series created: ${seriesCreated}`);
  console.log(`${prefix}Memberships created: ${membershipsCreated}`);
  console.log(`\n${prefix}Migration complete.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
