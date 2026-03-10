/**
 * Download camera images from dpreview to local filesystem.
 *
 * Reads the scraped cameras JSON and downloads images to
 * public/images/cameras/{slug}/ for each camera that has images.
 *
 * Usage: node scripts/download-camera-images.mjs [scraped-cameras.json] [--ilc-only]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public', 'images', 'cameras');

const dataFile = process.argv[2] || path.join(__dirname, '..', '..', 'dpreview-scraped-cameras.json');
const ilcOnly = process.argv.includes('--ilc-only');

const scraped = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const cameras = ilcOnly ? scraped.filter(c => c.lensMount) : scraped;

console.log(`Processing ${cameras.length} cameras (ilcOnly=${ilcOnly})`);

const delay = ms => new Promise(r => setTimeout(r, ms));

let downloaded = 0;
let skipped = 0;
let errors = 0;

for (let i = 0; i < cameras.length; i++) {
  const cam = cameras[i];
  if (!cam.images || cam.images.length === 0) {
    skipped++;
    continue;
  }

  // Build slug the same way the runner does
  const slug = cam.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const year = cam.yearIntroduced;
  const fullSlug = year ? `camera/${slug}-${year}` : `camera/${slug}`;
  const dirSlug = fullSlug.replace(/\//g, '__');
  const dir = path.join(publicDir, dirSlug);

  // Skip if already downloaded
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    skipped++;
    continue;
  }

  fs.mkdirSync(dir, { recursive: true });

  for (let j = 0; j < cam.images.length; j++) {
    const imgUrl = typeof cam.images[j] === 'string' ? cam.images[j] : cam.images[j].src;
    try {
      const resp = await fetch(imgUrl);
      if (!resp.ok) {
        errors++;
        continue;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      const ext = imgUrl.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png';
      const filename = `${j + 1}.${ext}`;
      fs.writeFileSync(path.join(dir, filename), buffer);
      downloaded++;
    } catch (err) {
      errors++;
    }
  }

  if ((i + 1) % 50 === 0) {
    console.log(`  Progress: ${i + 1}/${cameras.length} cameras, ${downloaded} images downloaded, ${errors} errors`);
  }

  // Small delay between cameras to be polite
  await delay(500);
}

console.log(`\nDone!`);
console.log(`  Cameras processed: ${cameras.length}`);
console.log(`  Images downloaded: ${downloaded}`);
console.log(`  Cameras skipped (no images or already downloaded): ${skipped}`);
console.log(`  Image errors: ${errors}`);
