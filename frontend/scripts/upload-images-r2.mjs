/**
 * Download images from dpreview CDN, resize to thumbnails, and upload to Cloudflare R2.
 * Updates the scraped JSON with R2 URLs so they can be inserted into the DB.
 *
 * Usage: node scripts/upload-images-r2.mjs [scraped-cameras.json] [--ilc-only] [--dry-run]
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.error('Missing R2 env vars. Need: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
  process.exit(1);
}

const MAX_SIZE = 500; // Max width/height in pixels

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const dataFile = process.argv[2] || path.join(__dirname, '..', '..', 'dpreview-scraped-cameras.json');
const ilcOnly = process.argv.includes('--ilc-only');
const dryRun = process.argv.includes('--dry-run');

const scraped = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const cameras = ilcOnly ? scraped.filter(c => c.lensMount) : scraped;

console.log(`Processing ${cameras.length} cameras (ilcOnly=${ilcOnly}, dryRun=${dryRun})`);

const delay = ms => new Promise(r => setTimeout(r, ms));

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) return null;

  const buffer = Buffer.from(await resp.arrayBuffer());

  // Resize to fit within 500x500, convert to WebP
  const resized = await sharp(buffer)
    .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    Body: resized,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${R2_PUBLIC_URL}/${r2Key}`;
}

let totalUploaded = 0;
let totalSkipped = 0;
let totalErrors = 0;
let totalBytesUploaded = 0;
const updatedCameras = [];

for (let i = 0; i < cameras.length; i++) {
  const cam = cameras[i];
  const slug = cam.dpreviewSlug;
  const newImages = [];

  if (!cam.images || cam.images.length === 0) {
    updatedCameras.push(cam);
    continue;
  }

  for (let j = 0; j < cam.images.length; j++) {
    const imgUrl = typeof cam.images[j] === 'string' ? cam.images[j] : cam.images[j].src;
    const r2Key = `cameras/${slug}/${j + 1}.webp`;

    if (dryRun) {
      newImages.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: cam.name || '' });
      totalSkipped++;
      continue;
    }

    try {
      const exists = await objectExists(r2Key);
      if (exists) {
        newImages.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: cam.name || '' });
        totalSkipped++;
        continue;
      }

      const publicUrl = await downloadResizeUpload(imgUrl, r2Key);
      if (publicUrl) {
        newImages.push({ src: publicUrl, alt: cam.name || '' });
        totalUploaded++;
      } else {
        totalErrors++;
      }
    } catch (err) {
      console.error(`  Error uploading ${r2Key}: ${err.message}`);
      totalErrors++;
    }
  }

  updatedCameras.push({ ...cam, images: newImages });

  if ((i + 1) % 25 === 0) {
    console.log(`  Progress: ${i + 1}/${cameras.length} cameras | ${totalUploaded} uploaded, ${totalSkipped} skipped, ${totalErrors} errors`);
  }

  // Small delay between cameras
  if (!dryRun) await delay(200);
}

// Write updated JSON with R2 URLs
const outputFile = dataFile.replace('.json', '-r2.json');
fs.writeFileSync(outputFile, JSON.stringify(updatedCameras, null, 2));

console.log(`\nDone!`);
console.log(`  Cameras: ${cameras.length}`);
console.log(`  Images uploaded: ${totalUploaded}`);
console.log(`  Images skipped (already exist): ${totalSkipped}`);
console.log(`  Errors: ${totalErrors}`);
console.log(`  Output: ${outputFile}`);
