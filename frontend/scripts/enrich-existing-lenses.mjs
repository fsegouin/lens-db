/**
 * Replace broken WordPress image URLs on existing lenses with R2-hosted dpreview images.
 *
 * Usage: node scripts/enrich-existing-lenses.mjs [--dry-run]
 */

import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL,
} = process.env;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const toReplace = JSON.parse(fs.readFileSync('../dpreview-lenses-to-replace-images.json', 'utf8'));

const delay = ms => new Promise(r => setTimeout(r, ms));

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch { return false; }
}

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  const resized = await sharp(buffer)
    .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME, Key: r2Key, Body: resized,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${R2_PUBLIC_URL}/${r2Key}`;
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
      newImages.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: lens.name });
      continue;
    }

    try {
      const exists = await objectExists(r2Key);
      if (exists) {
        newImages.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: lens.name });
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
