import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const cameras = await sql`SELECT name, slug FROM cameras`;
const lenses = await sql`SELECT name, slug FROM lenses`;

const dir = new URL('../../', import.meta.url).pathname;
const dpCams = fs.readFileSync(dir + 'dpreview-cameras.txt','utf8').trim().split('\n').map(l => {
  const [brand, slug] = l.split('|');
  return { brand, slug };
});
const dpLenses = fs.readFileSync(dir + 'dpreview-lenses.txt','utf8').trim().split('\n').map(l => {
  const [brand, slug] = l.split('|');
  return { brand, slug };
});

// Normalize for matching
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const camNorms = new Set(cameras.map(c => normalize(c.name)));
const lensNorms = new Set(lenses.map(l => normalize(l.name)));

console.log('=== STATS ===');
console.log('DB cameras:', cameras.length, '| DB lenses:', lenses.length);
console.log('DPreview cameras:', dpCams.length, '| DPreview lenses:', dpLenses.length);

// For cameras - check if dpreview slug (normalized) matches any DB camera name (normalized)
const missingCams = dpCams.filter(dp => {
  const dpNorm = normalize(dp.slug);
  // Direct match
  if (camNorms.has(dpNorm)) return false;
  // Check if the key part (without brand prefix) matches
  const dpKey = dp.slug.replace(dp.brand + '_', '').replace(/_/g, '');
  for (const cn of camNorms) {
    if (cn.includes(dpKey) && dpKey.length > 3) return false;
  }
  return true;
});

const missingLenses = dpLenses.filter(dp => {
  const dpNorm = normalize(dp.slug);
  if (lensNorms.has(dpNorm)) return false;
  // Try matching key portion
  const dpKey = dp.slug.replace(dp.brand + '_', '').replace(/_/g, '').replace(/p/g, '.');
  for (const ln of lensNorms) {
    if (ln.includes(dpKey) && dpKey.length > 5) return false;
  }
  return true;
});

console.log('\n=== POTENTIALLY MISSING CAMERAS (' + missingCams.length + ') ===');
const camsByBrand = {};
missingCams.forEach(c => {
  if (!camsByBrand[c.brand]) camsByBrand[c.brand] = [];
  camsByBrand[c.brand].push(c.slug);
});
Object.keys(camsByBrand).sort().forEach(b => {
  console.log('\n' + b + ' (' + camsByBrand[b].length + '):');
  camsByBrand[b].forEach(s => console.log('  ' + s));
});

console.log('\n=== POTENTIALLY MISSING LENSES (' + missingLenses.length + ') ===');
const lensByBrand = {};
missingLenses.forEach(l => {
  if (!lensByBrand[l.brand]) lensByBrand[l.brand] = [];
  lensByBrand[l.brand].push(l.slug);
});
Object.keys(lensByBrand).sort().forEach(b => {
  console.log('\n' + b + ' (' + lensByBrand[b].length + '):');
  lensByBrand[b].forEach(s => console.log('  ' + s));
});
