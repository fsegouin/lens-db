/**
 * Duplicate check using launch year comparison.
 * Same brand + focal + aperture + same year = likely duplicate.
 *
 * Usage: node scripts/check-lens-duplicates-v3.mjs
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-lenses.json', 'utf8'));
const newLenses = JSON.parse(fs.readFileSync('../dpreview-lenses-new.json', 'utf8'));
const newNames = new Set(newLenses.map(l => l.name));
const newScraped = scraped.filter(l => newNames.has(l.name));

const existing = await sql`SELECT id, name, slug, brand, year_introduced FROM lenses`;

// Aggressive normalization for exact dupes
function aggressiveNorm(name) {
  return name
    .toLowerCase()
    .replace(/^carl zeiss/, 'zeiss')
    .replace(/^venus optics/, 'laowa')
    .replace(/^smc pentax/, 'pentax')
    .replace(/^hd pentax/, 'pentax')
    .replace(/^fujinon/, 'fujifilm')
    .replace(/^fujifilm fujinon/, 'fujifilm')
    .replace(/^fujifilm super ebc fujinon/, 'fujifilm')
    .replace(/^panasonic lumix/, 'panasonic')
    .replace(/^om system m\.zuiko/, 'olympus')
    .replace(/^om system/, 'olympus')
    .replace(/^m\.zuiko/, 'olympus')
    .replace(/^olympus m\.zuiko/, 'olympus')
    .replace(/f\/(\d)/gi, 'f$1')
    .replace(/[^a-z0-9]/g, '');
}

const existingByAggressive = new Map();
for (const lens of existing) {
  const norm = aggressiveNorm(lens.name);
  if (!existingByAggressive.has(norm)) existingByAggressive.set(norm, []);
  existingByAggressive.get(norm).push(lens);
}

// Extract specs from name
function extractSpecs(name) {
  const focal = name.match(/(\d+)(?:\s*-\s*(\d+))?\s*mm/i);
  const aperture = name.match(/[fF]\/?\s*(\d+\.?\d*)/);
  const brandWord = name.split(/\s+/)[0].toLowerCase()
    .replace('carl', 'zeiss').replace('venus', 'laowa')
    .replace('fujinon', 'fujifilm').replace('smc', 'pentax')
    .replace('hd', 'pentax');
  return {
    focalMin: focal ? focal[1] : null,
    focalMax: focal ? (focal[2] || focal[1]) : null,
    aperture: aperture ? aperture[1] : null,
    brand: brandWord,
  };
}

// Group existing by brand+focal+aperture
const existingByKey = new Map();
for (const lens of existing) {
  const s = extractSpecs(lens.name);
  if (s.focalMin && s.aperture) {
    const key = `${s.brand}|${s.focalMin}|${s.focalMax}|${s.aperture}`;
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(lens);
  }
}

// Extract year from dpreview specs
function getDpYear(lens) {
  if (!lens.specs) return null;
  const yearStr = lens.specs['Year'] || lens.specs['Announced'];
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

const exactDupes = [];
const yearDupes = [];
const genuineNew = [];

for (const lens of newScraped) {
  // Check exact duplicate first
  const norm = aggressiveNorm(lens.name);
  if (existingByAggressive.has(norm)) {
    exactDupes.push({
      dpreview: lens.name,
      db: existingByAggressive.get(norm).map(m => m.name),
    });
    continue;
  }

  // Check close match with year comparison
  const s = extractSpecs(lens.name);
  if (s.focalMin && s.aperture) {
    const key = `${s.brand}|${s.focalMin}|${s.focalMax}|${s.aperture}`;
    const candidates = existingByKey.get(key);
    if (candidates) {
      const dpYear = getDpYear(lens);
      const yearMatches = dpYear
        ? candidates.filter(c => c.year_introduced && Math.abs(c.year_introduced - dpYear) <= 1)
        : [];

      if (yearMatches.length > 0) {
        yearDupes.push({
          dpreview: lens.name,
          dpYear,
          db: yearMatches.map(m => ({ name: m.name, year: m.year_introduced })),
        });
        continue;
      }
    }
  }

  genuineNew.push(lens);
}

console.log('=== DUPLICATE CHECK WITH YEAR COMPARISON ===');
console.log(`Total checked: ${newScraped.length}`);
console.log(`Exact duplicates (name normalization): ${exactDupes.length}`);
console.log(`Year-based duplicates (same brand+focal+aperture+year±1): ${yearDupes.length}`);
console.log(`Genuinely new: ${genuineNew.length}`);

if (yearDupes.length > 0) {
  console.log('\n=== YEAR-BASED DUPLICATES ===');
  yearDupes.forEach(d => {
    console.log(`  DP: ${d.dpreview} (${d.dpYear})`);
    d.db.forEach(m => console.log(`  DB: ${m.name} (${m.year})`));
    console.log();
  });
}

// Write genuinely new list
fs.writeFileSync('../dpreview-lenses-genuinely-new.json', JSON.stringify(genuineNew, null, 2));
fs.writeFileSync('../dpreview-lenses-year-dupes.json', JSON.stringify(yearDupes, null, 2));
console.log('\nWrote dpreview-lenses-genuinely-new.json');
console.log('Wrote dpreview-lenses-year-dupes.json');
