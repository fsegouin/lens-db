/**
 * Analyze scraped dpreview lenses vs DB lenses.
 * Identifies matches, gaps, and enrichment opportunities.
 *
 * Usage: node scripts/analyze-lens-gaps.mjs
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-lenses.json', 'utf8'));
const normalizeName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const scrapedByNorm = new Map();
scraped.forEach(l => {
  if (l.name) scrapedByNorm.set(normalizeName(l.name), l);
});

const existing = await sql`SELECT id, name, slug, images, specs FROM lenses`;
const existingByNorm = new Map();
existing.forEach(l => existingByNorm.set(normalizeName(l.name), l));

let matched = 0;
let matchedWithBrokenImages = 0;
let matchedCanReplaceImages = 0;
let matchedCanEnrichSpecs = 0;
let notInDb = 0;

const toReplaceImages = [];
const toEnrichSpecs = [];
const newLenses = [];

for (const [norm, lens] of scrapedByNorm) {
  const dbLens = existingByNorm.get(norm);
  if (dbLens) {
    matched++;
    const imagesStr = JSON.stringify(dbLens.images || []);
    const hasBroken = imagesStr.includes('lens-db.com');
    const hasNoImages = !dbLens.images || dbLens.images.length === 0;

    if (hasBroken || hasNoImages) {
      matchedWithBrokenImages++;
      if (lens.images && lens.images.length > 0) {
        matchedCanReplaceImages++;
        toReplaceImages.push({
          id: dbLens.id,
          name: dbLens.name,
          slug: dbLens.slug,
          dpreviewImages: lens.images,
          dpreviewSlug: lens.dpreviewSlug,
        });
      }
    }

    // Check if dpreview has specs we don't
    const dbSpecs = dbLens.specs || {};
    const dpSpecs = lens.specs || {};
    const dbSpecCount = Object.keys(dbSpecs).length;
    const dpSpecCount = Object.keys(dpSpecs).length;
    if (dpSpecCount > 0 && dpSpecCount > dbSpecCount) {
      matchedCanEnrichSpecs++;
      toEnrichSpecs.push({
        id: dbLens.id,
        name: dbLens.name,
        dbSpecCount,
        dpSpecCount,
      });
    }
  } else {
    notInDb++;
    newLenses.push({
      name: lens.name,
      dpreviewSlug: lens.dpreviewSlug,
      imageCount: lens.images ? lens.images.length : 0,
      specCount: lens.specs ? Object.keys(lens.specs).length : 0,
    });
  }
}

console.log('=== LENS GAP ANALYSIS ===');
console.log(`Scraped from dpreview: ${scraped.length}`);
console.log(`In DB: ${existing.length}`);
console.log(`Matched: ${matched}`);
console.log(`  With broken/missing images: ${matchedWithBrokenImages}`);
console.log(`  Can replace images from dpreview: ${matchedCanReplaceImages}`);
console.log(`  Can enrich specs from dpreview: ${matchedCanEnrichSpecs}`);
console.log(`Not in DB (new): ${notInDb}`);

if (toReplaceImages.length > 0) {
  console.log(`\nSample lenses to replace images (${toReplaceImages.length} total):`);
  toReplaceImages.slice(0, 10).forEach(l =>
    console.log(`  ${l.name} -> ${l.dpreviewSlug} (${l.dpreviewImages.length} imgs)`)
  );
}

if (newLenses.length > 0) {
  console.log(`\nNew lenses not in DB (${newLenses.length} total):`);
  newLenses.forEach(l =>
    console.log(`  ${l.name} (${l.imageCount} imgs, ${l.specCount} specs)`)
  );
}

// Write outputs
fs.writeFileSync('../dpreview-lenses-to-replace-images.json', JSON.stringify(toReplaceImages, null, 2));
fs.writeFileSync('../dpreview-lenses-new.json', JSON.stringify(newLenses, null, 2));
fs.writeFileSync('../dpreview-lenses-to-enrich-specs.json', JSON.stringify(toEnrichSpecs, null, 2));

console.log('\nWrote:');
console.log('  dpreview-lenses-to-replace-images.json');
console.log('  dpreview-lenses-new.json');
console.log('  dpreview-lenses-to-enrich-specs.json');
