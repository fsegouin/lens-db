/**
 * Replace broken WordPress image URLs on existing lenses with R2-hosted dpreview images.
 *
 * Usage: node scripts/enrich-existing-lenses.mjs [--dry-run]
 */

import { neon } from '@neondatabase/serverless';
import { objectExists, processAndUpload, R2_PUBLIC } from './lib/r2-upload.mjs';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const toReplace = JSON.parse(fs.readFileSync('../dpreview-lenses-to-replace-images.json', 'utf8'));

const delay = ms => new Promise(r => setTimeout(r, ms));

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}

console.log(`Processing ${toReplace.length} lenses (dryRun=${dryRun})`);

let updated = 0;
let uploaded = 0;
let errors = 0;

for (let i = 0; i < toReplace.length; i++) {
  const lens = toReplace[i];
  const slug = lens.dpreviewSlug;
  const newImages = [];

  for (let j = 0; j < lens.dpreviewImages.length; j++) {
    const imgUrl = typeof lens.dpreviewImages[j] === 'string' ? lens.dpreviewImages[j] : lens.dpreviewImages[j].src;
    const r2Key = `lenses/${slug}/${j + 1}.webp`;

    if (dryRun) {
      newImages.push({ src: `${R2_PUBLIC}/${r2Key}`, alt: lens.name });
      continue;
    }

    try {
      const exists = await objectExists(r2Key);
      if (exists) {
        newImages.push({ src: `${R2_PUBLIC}/${r2Key}`, alt: lens.name });
        continue;
      }
      const publicUrl = await downloadResizeUpload(imgUrl, r2Key);
      if (publicUrl) {
        newImages.push({ src: publicUrl, alt: lens.name });
        uploaded++;
      } else {
        console.error(`  Failed to download: ${imgUrl}`);
        errors++;
      }
    } catch (err) {
      console.error(`  Error: ${r2Key}: ${err.message}`);
      errors++;
    }
  }

  if (newImages.length > 0) {
    if (!dryRun) {
      await sql`UPDATE lenses SET images = ${JSON.stringify(newImages)} WHERE id = ${lens.id}`;
    }
    updated++;
    console.log(`  [${i + 1}/${toReplace.length}] ${lens.name}: ${newImages.length} images`);
  }

  if (!dryRun) await delay(200);
}

console.log(`\nDone! (dryRun=${dryRun})`);
console.log(`  Lenses processed: ${toReplace.length}`);
console.log(`  Lenses updated: ${updated}`);
console.log(`  Images uploaded: ${uploaded}`);
console.log(`  Errors: ${errors}`);
