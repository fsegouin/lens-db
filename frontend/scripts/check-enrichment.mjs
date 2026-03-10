import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-cameras.json', 'utf8'));
const normalizeName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const scrapedByNorm = new Map();
scraped.forEach(c => { if (c.name) scrapedByNorm.set(normalizeName(c.name), c); });

// All cameras with broken old WordPress image URLs
const broken = await sql`SELECT id, name, slug, images FROM cameras WHERE images::text LIKE ${'%lens-db.com%'}`;

let canReplace = 0;
let canReplaceWithImages = 0;
const replaceable = [];

for (const cam of broken) {
  const match = scrapedByNorm.get(normalizeName(cam.name));
  if (!match) continue;
  canReplace++;
  if (match.images && match.images.length > 0) {
    canReplaceWithImages++;
    replaceable.push({ id: cam.id, name: cam.name, dpSlug: match.dpreviewSlug, imageCount: match.images.length });
  }
}

console.log('Cameras with broken WordPress URLs:', broken.length);
console.log('Matched to dpreview:', canReplace);
console.log('Dpreview has images for:', canReplaceWithImages);
console.log('Dpreview has no images for:', canReplace - canReplaceWithImages);

console.log('\nSample replaceable:');
replaceable.slice(0, 15).forEach(c => console.log('  ' + c.name + ' -> ' + c.dpSlug + ' (' + c.imageCount + ' imgs)'));
