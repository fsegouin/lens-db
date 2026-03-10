/**
 * Tighter duplicate check: normalize both names aggressively and compare.
 * Strips F/ vs F, removes spaces, lowercases, normalizes brand aliases.
 *
 * Usage: node scripts/check-lens-duplicates-v2.mjs
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-lenses.json', 'utf8'));
const newLenses = JSON.parse(fs.readFileSync('../dpreview-lenses-new.json', 'utf8'));
const newNames = new Set(newLenses.map(l => l.name));
const newScraped = scraped.filter(l => newNames.has(l.name));

const existing = await sql`SELECT id, name, slug, brand FROM lenses`;

// Aggressive normalization that handles naming differences
function aggressiveNorm(name) {
  return name
    .toLowerCase()
    // Normalize brand aliases
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
    // Normalize f-stop notation: F/1.4, F1.4, f/1.4 -> f1.4
    .replace(/f\/(\d)/gi, 'f$1')
    // Remove all non-alphanumeric
    .replace(/[^a-z0-9]/g, '');
}

// Build lookup for existing
const existingByAggressive = new Map();
for (const lens of existing) {
  const norm = aggressiveNorm(lens.name);
  if (!existingByAggressive.has(norm)) existingByAggressive.set(norm, []);
  existingByAggressive.get(norm).push(lens);
}

let exactDupes = 0;
let genuineNew = 0;

const exactDupeList = [];
const genuineNewList = [];

for (const lens of newScraped) {
  const norm = aggressiveNorm(lens.name);
  const matches = existingByAggressive.get(norm);
  if (matches) {
    exactDupes++;
    exactDupeList.push({
      dpreview: lens.name,
      db: matches.map(m => m.name),
    });
  } else {
    genuineNew++;
    genuineNewList.push(lens.name);
  }
}

console.log('=== AGGRESSIVE DUPLICATE CHECK ===');
console.log(`Total checked: ${newScraped.length}`);
console.log(`Exact duplicates (aggressive norm): ${exactDupes}`);
console.log(`Genuinely new: ${genuineNew}`);

if (exactDupeList.length > 0) {
  console.log('\n=== EXACT DUPLICATES (different naming, same lens) ===');
  exactDupeList.forEach(d => {
    console.log(`  DP: ${d.dpreview}`);
    d.db.forEach(m => console.log(`  DB: ${m}`));
    console.log();
  });
}

// Also do a substring/contains check for close matches
console.log('\n=== CLOSE MATCH CHECK (focal + aperture + brand word) ===');
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

const existingByKey = new Map();
for (const lens of existing) {
  const s = extractSpecs(lens.name);
  if (s.focalMin && s.aperture) {
    const key = `${s.brand}|${s.focalMin}|${s.focalMax}|${s.aperture}`;
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(lens);
  }
}

let closeMatches = 0;
const closeMatchList = [];
for (const lens of genuineNewList) {
  const s = extractSpecs(lens);
  if (!s.focalMin || !s.aperture) continue;
  const key = `${s.brand}|${s.focalMin}|${s.focalMax}|${s.aperture}`;
  const matches = existingByKey.get(key);
  if (matches) {
    closeMatches++;
    closeMatchList.push({
      dpreview: lens,
      db: matches.map(m => m.name),
    });
  }
}

console.log(`Close matches (same brand+focal+aperture, different naming): ${closeMatches}`);
if (closeMatchList.length > 0) {
  closeMatchList.forEach(d => {
    console.log(`  DP: ${d.dpreview}`);
    d.db.forEach(m => console.log(`  DB: ${m}`));
    console.log();
  });
}

console.log(`\nFinal count: ${genuineNew - closeMatches} clearly new, ${closeMatches} need manual review`);

fs.writeFileSync('../dpreview-lens-close-matches.json', JSON.stringify(closeMatchList, null, 2));
