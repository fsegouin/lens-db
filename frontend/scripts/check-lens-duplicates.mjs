/**
 * Check if "new" dpreview lenses are actually duplicates of existing DB lenses
 * with slightly different naming.
 *
 * Strategies:
 * 1. Exact normalized match (already done - these passed)
 * 2. Fuzzy: strip brand prefixes, compare focal length + aperture
 * 3. Show side-by-side for manual review
 *
 * Usage: node scripts/check-lens-duplicates.mjs
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-lenses.json', 'utf8'));
const newLenses = JSON.parse(fs.readFileSync('../dpreview-lenses-new.json', 'utf8'));
const newNames = new Set(newLenses.map(l => l.name));

// Get full scraped data for new lenses
const newScraped = scraped.filter(l => newNames.has(l.name));

const existing = await sql`SELECT id, name, slug, brand FROM lenses`;

// Build lookup structures for existing lenses
const normalizeName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Extract key specs from lens name: focal length(s) and max aperture
function extractKeySpecs(name) {
  const focal = name.match(/(\d+)(?:-(\d+))?\s*mm/i);
  const aperture = name.match(/[fF]\/?\s*(\d+\.?\d*)/);
  return {
    focalMin: focal ? parseInt(focal[1]) : null,
    focalMax: focal ? (focal[2] ? parseInt(focal[2]) : parseInt(focal[1])) : null,
    aperture: aperture ? parseFloat(aperture[1]) : null,
  };
}

// Normalize brand names for comparison
function normalizeBrand(name) {
  return name
    .replace(/^Carl Zeiss/i, 'Zeiss')
    .replace(/^Venus Optics/i, 'Laowa')
    .replace(/^smc Pentax/i, 'Pentax')
    .replace(/^HD Pentax/i, 'Pentax')
    .replace(/^Nikkor/i, 'Nikon')
    .replace(/^NIKKOR/i, 'Nikon')
    .replace(/^Fujinon/i, 'Fujifilm')
    .replace(/^LUMIX/i, 'Panasonic')
    .replace(/^Lumix/i, 'Panasonic')
    .replace(/^OM System/i, 'Olympus')
    .replace(/^M\.Zuiko/i, 'Olympus');
}

// Group existing lenses by focal+aperture combo for quick lookup
const existingBySpecs = new Map();
for (const lens of existing) {
  const specs = extractKeySpecs(lens.name);
  if (specs.focalMin && specs.aperture) {
    const key = `${specs.focalMin}-${specs.focalMax}-${specs.aperture}`;
    if (!existingBySpecs.has(key)) existingBySpecs.set(key, []);
    existingBySpecs.get(key).push(lens);
  }
}

let likelyDuplicates = 0;
let possibleDuplicates = 0;
let clean = 0;

const duplicateReport = [];

for (const lens of newScraped) {
  const specs = extractKeySpecs(lens.name);
  if (!specs.focalMin || !specs.aperture) {
    clean++;
    continue;
  }

  const key = `${specs.focalMin}-${specs.focalMax}-${specs.aperture}`;
  const candidates = existingBySpecs.get(key) || [];

  if (candidates.length === 0) {
    clean++;
    continue;
  }

  // Check if any candidate shares brand similarity
  const dpNorm = normalizeBrand(lens.name).toLowerCase();

  const matches = candidates.filter(c => {
    const dbNorm = normalizeBrand(c.name).toLowerCase();
    // Same brand prefix?
    const dpBrand = dpNorm.split(' ')[0];
    const dbBrand = dbNorm.split(' ')[0];
    return dpBrand === dbBrand;
  });

  if (matches.length > 0) {
    likelyDuplicates++;
    duplicateReport.push({
      dpreview: lens.name,
      dbMatches: matches.map(m => m.name),
      type: 'LIKELY',
    });
  } else {
    // Different brand but same focal+aperture — probably not a duplicate
    // but flag if names are very similar
    const closeMatches = candidates.filter(c => {
      const sim = normalizeName(normalizeBrand(lens.name));
      const dbSim = normalizeName(normalizeBrand(c.name));
      // Check if one contains the other or high overlap
      return sim.includes(dbSim.slice(0, 15)) || dbSim.includes(sim.slice(0, 15));
    });
    if (closeMatches.length > 0) {
      possibleDuplicates++;
      duplicateReport.push({
        dpreview: lens.name,
        dbMatches: closeMatches.map(m => m.name),
        type: 'POSSIBLE',
      });
    } else {
      clean++;
    }
  }
}

console.log('=== DUPLICATE CHECK ===');
console.log(`Total new lenses checked: ${newScraped.length}`);
console.log(`Likely duplicates (same brand + focal + aperture): ${likelyDuplicates}`);
console.log(`Possible duplicates (similar names): ${possibleDuplicates}`);
console.log(`Clean (no matches): ${clean}`);

if (duplicateReport.length > 0) {
  console.log('\n=== LIKELY DUPLICATES ===');
  duplicateReport.filter(d => d.type === 'LIKELY').forEach(d => {
    console.log(`  DPreview: ${d.dpreview}`);
    d.dbMatches.forEach(m => console.log(`       DB: ${m}`));
    console.log();
  });

  const possible = duplicateReport.filter(d => d.type === 'POSSIBLE');
  if (possible.length > 0) {
    console.log('=== POSSIBLE DUPLICATES ===');
    possible.forEach(d => {
      console.log(`  DPreview: ${d.dpreview}`);
      d.dbMatches.forEach(m => console.log(`       DB: ${m}`));
      console.log();
    });
  }
}

fs.writeFileSync('../dpreview-lens-duplicate-report.json', JSON.stringify(duplicateReport, null, 2));
console.log('Wrote dpreview-lens-duplicate-report.json');
