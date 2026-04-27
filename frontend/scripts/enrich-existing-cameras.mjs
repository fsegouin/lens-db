/**
 * Replace broken WordPress image URLs with R2-hosted dpreview images.
 * Also enriches specs where dpreview has more data.
 *
 * Usage: node scripts/enrich-existing-cameras.mjs [--dry-run]
 */

import { neon } from '@neondatabase/serverless';
import { objectExists, processAndUpload, R2_PUBLIC } from './lib/r2-upload.mjs';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const scraped = JSON.parse(fs.readFileSync('../dpreview-scraped-cameras.json', 'utf8'));
const normalizeName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const scrapedByNorm = new Map();
scraped.forEach(c => { if (c.name) scrapedByNorm.set(normalizeName(c.name), c); });

const delay = ms => new Promise(r => setTimeout(r, ms));

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}

// Get all cameras with broken WordPress URLs
const broken = await sql`SELECT id, name, slug, images, specs FROM cameras WHERE images::text LIKE ${'%lens-db.com%'}`;

let updatedImages = 0;
let uploadedCount = 0;
let errors = 0;

for (let i = 0; i < broken.length; i++) {
  const cam = broken[i];
  const match = scrapedByNorm.get(normalizeName(cam.name));
  if (!match || !match.images || match.images.length === 0) continue;

  const slug = match.dpreviewSlug;
  const newImages = [];

  for (let j = 0; j < match.images.length; j++) {
    const imgUrl = typeof match.images[j] === 'string' ? match.images[j] : match.images[j].src;
    const r2Key = `cameras/${slug}/${j + 1}.webp`;

    if (dryRun) {
      newImages.push({ src: `${R2_PUBLIC}/${r2Key}`, alt: cam.name });
      continue;
    }

    try {
      const exists = await objectExists(r2Key);
      if (exists) {
        newImages.push({ src: `${R2_PUBLIC}/${r2Key}`, alt: cam.name });
        continue;
      }
      const publicUrl = await downloadResizeUpload(imgUrl, r2Key);
      if (publicUrl) {
        newImages.push({ src: publicUrl, alt: cam.name });
        uploadedCount++;
      } else {
        errors++;
      }
    } catch (err) {
      console.error(`  Error: ${r2Key}: ${err.message}`);
      errors++;
    }
  }

  if (newImages.length > 0) {
    if (!dryRun) {
      await sql`UPDATE cameras SET images = ${JSON.stringify(newImages)} WHERE id = ${cam.id}`;
    }
    updatedImages++;
  }

  if ((i + 1) % 25 === 0) {
    console.log(`  Progress: ${i + 1}/${broken.length} | ${updatedImages} updated, ${uploadedCount} uploaded, ${errors} errors`);
  }

  if (!dryRun) await delay(200);
}

console.log(`\nDone! (dryRun=${dryRun})`);
console.log(`  Cameras with broken URLs: ${broken.length}`);
console.log(`  Cameras updated with R2 images: ${updatedImages}`);
console.log(`  Images uploaded: ${uploadedCount}`);
console.log(`  Errors: ${errors}`);
