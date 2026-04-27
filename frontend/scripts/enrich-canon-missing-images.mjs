/**
 * One-off: backfill images for the 10 Canon cameras with empty `images`
 * (excludes 3 obscure variants where no specific image was found).
 *
 * Sources: Wikimedia Commons (CC) for most; Camera-Wiki/Flickr for vintage.
 * Pipeline mirrors scripts/enrich-existing-cameras.mjs:
 *   fetch source -> sharp resize 500x500 webp -> R2 PutObject -> UPDATE cameras.images
 *
 * Usage:
 *   node scripts/enrich-canon-missing-images.mjs --dry-run
 *   node scripts/enrich-canon-missing-images.mjs
 */

import { neon } from '@neondatabase/serverless';
import { objectExists, processAndUpload, R2_PUBLIC } from './lib/r2-upload.mjs';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const items = [
  { id: 3156, name: 'Canon EOS 1000D (EOS Rebel XS / Kiss F Digital)', slug: 'camera/canon-eos-1000d-eos-rebel-xs-kiss-f-digital-2008',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Canon_EOS_1000D_IMG_2001b.jpg/960px-Canon_EOS_1000D_IMG_2001b.jpg' },
  { id: 3172, name: 'Canon EOS 20Da', slug: 'camera/canon-eos-20da-2005',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Canon_EOS_20Da.jpg' },
  { id: 3176, name: 'Canon EOS 300D (EOS Digital Rebel / EOS Kiss Digital)', slug: 'camera/canon-eos-300d-eos-digital-rebel-eos-kiss-digital-2003',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Eos_300d_v_sst.jpg/960px-Eos_300d_v_sst.jpg' },
  { id: 3173, name: 'Canon EOS 350D (EOS Digital Rebel XT / EOS Kiss Digital N)', slug: 'camera/canon-eos-350d-eos-digital-rebel-xt-eos-kiss-digital-n-2005',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Canon_EOS_Rebel_XT.JPG/960px-Canon_EOS_Rebel_XT.JPG' },
  { id: 3167, name: 'Canon EOS 400D (EOS Digital Rebel XTi / EOS Kiss Digital X)', slug: 'camera/canon-eos-400d-eos-digital-rebel-xti-eos-kiss-digital-x-2006',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Canon_EOS_400D.jpg/960px-Canon_EOS_400D.jpg' },
  { id: 3243, name: 'Canon EOS 700[QD]', slug: 'camera/canon-eos-700qd-1990',
    sourceUrl: 'https://farm7.static.flickr.com/6208/6041515722_90dbdc1cdb.jpg' },
  { id: 3253, name: 'Canon EOS Rebel S', slug: 'camera/canon-eos-rebel-s-1990',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/My_Canon_Rebel_%285190222140%29_%28cropped%29.jpg/960px-My_Canon_Rebel_%285190222140%29_%28cropped%29.jpg' },
  { id: 3265, name: 'Canon OD F-1', slug: 'camera/canon-od-f-1-1978',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Canon_F-1_%2813746363604%29.jpg/960px-Canon_F-1_%2813746363604%29.jpg' },
  { id: 3267, name: 'Canon S I', slug: 'camera/canon-s-i-1946',
    sourceUrl: 'https://farm9.staticflickr.com/8018/7702003056_d288e845af_m.jpg' },
  { id: 3268, name: 'Canon S II', slug: 'camera/canon-s-ii-1946',
    sourceUrl: 'https://farm4.staticflickr.com/3704/11200046735_dc85c498fe_n.jpg' },
];

const r2KeyForSlug = (slug) => {
  const tail = slug.replace(/^camera\//, '');
  return `cameras/${tail}/1.webp`;
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl, { headers: { 'User-Agent': 'lens-db-image-backfill/1.0 (https://lens-db.com)' } });
  if (!resp.ok) throw new Error(`fetch ${sourceUrl} -> ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}

let updated = 0, uploaded = 0, skipped = 0, errors = 0;

for (const item of items) {
  const r2Key = r2KeyForSlug(item.slug);
  const publicUrl = `${R2_PUBLIC}/${r2Key}`;
  const newImages = [{ src: publicUrl, alt: item.name }];

  console.log(`\n[${item.id}] ${item.name}`);
  console.log(`  source : ${item.sourceUrl}`);
  console.log(`  r2 key : ${r2Key}`);

  if (dryRun) {
    console.log(`  DRY RUN: would upload + UPDATE images = ${JSON.stringify(newImages)}`);
    continue;
  }

  try {
    const exists = await objectExists(r2Key);
    if (exists) {
      console.log('  R2 object already exists, skipping upload');
      skipped++;
    } else {
      await downloadResizeUpload(item.sourceUrl, r2Key);
      console.log('  uploaded');
      uploaded++;
    }
    await sql`UPDATE cameras SET images = ${JSON.stringify(newImages)} WHERE id = ${item.id}`;
    console.log('  DB updated');
    updated++;
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    errors++;
  }

  await delay(200);
}

console.log(`\nDone (dryRun=${dryRun}). updated=${updated} uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
