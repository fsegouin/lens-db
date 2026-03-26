/**
 * Import genuinely new lenses from dpreview into the DB.
 * Also uploads images to R2.
 *
 * Usage: node scripts/import-new-lenses.mjs [--dry-run]
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

const lenses = JSON.parse(fs.readFileSync('../dpreview-lenses-genuinely-new.json', 'utf8'));
const delay = ms => new Promise(r => setTimeout(r, ms));

// Load systems for mount matching
const systems = await sql`SELECT id, name FROM systems`;
const systemsByName = new Map();
systems.forEach(s => systemsByName.set(s.name.toLowerCase(), s));

const MOUNT_MAP = {
  'nikon z': 'nikon z',
  'nikon f': 'nikon f',
  'nikon 1': 'nikon 1',
  'canon rf-s': 'canon rf-s',
  'canon rf': 'canon rf',
  'canon ef-s': 'canon ef',
  'canon ef-m': 'canon ef-m',
  'canon ef': 'canon ef',
  'sony fe': 'sony e',
  'sony e': 'sony e',
  'sony/minolta alpha': 'sony a',
  'fujifilm x': 'fujifilm x',
  'fujifilm g': 'fujifilm g',
  'micro four thirds': 'micro four thirds',
  'four thirds': 'four thirds',
  'pentax q': 'pentax q',
  'pentax k': 'pentax k',
  'pentax 645': 'pentax 645',
  'samsung nx-m': 'samsung nx-m',
  'samsung nx': 'samsung nx',
  'leica m': 'leica m',
  'leica l': 'leica l',
  'l-mount': 'leica l',
  'leica t': 'leica l',
  'leica tl': 'leica l',
  'sigma sa': 'sigma sa',
  'hasselblad x': 'hasselblad x',
};

function findSystemId(mount) {
  if (!mount) return null;
  const mountLower = mount.toLowerCase();
  // Take first mount if multi-mount
  const firstMount = mountLower.split(',')[0].trim();
  for (const [key, sysName] of Object.entries(MOUNT_MAP)) {
    if (firstMount.includes(key)) {
      for (const [name, sys] of systemsByName) {
        if (name === sysName || name.includes(sysName)) {
          return sys.id;
        }
      }
    }
  }
  return null;
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function extractBrand(name) {
  // Multi-word brands checked first (longest match)
  const multiWordBrands = [
    ['Carl Zeiss Jena', 'Carl Zeiss Jena'],
    ['Carl Zeiss', 'Carl Zeiss'],
    ['HD Pentax', 'Pentax'],
    ['smc Pentax', 'Pentax'],
    ['SMC Pentax', 'Pentax'],
    ['Asahi Pentax', 'Pentax'],
    ['Nippon Kogaku', 'Nikon'],
    ['Venus Optics', 'Laowa'],
    ['OM System', 'Olympus'],
    ['Meyer-Optik', 'Meyer-Optik Görlitz'],
    ['Brightin Star', 'Brightin Star'],
    ['Light Lens Lab', 'Light Lens Lab'],
    ['MS Optics', 'MS Optics'],
  ];
  for (const [prefix, brand] of multiWordBrands) {
    if (name.startsWith(prefix)) return brand;
  }
  // Single-word brands
  const brandAliases = {
    '7Artisans': '7Artisans', '7artisans': '7Artisans',
    'Canon': 'Canon', 'Fujifilm': 'Fuji', 'Fujica': 'Fuji',
    'Hasselblad': 'Hasselblad', 'Holga': 'Holga', 'Irix': 'Irix',
    'Kamlan': 'Kamlan', 'Kenko': 'Kenko', 'Laowa': 'Laowa', 'Leica': 'Leica',
    'Lensbaby': 'Lensbaby', 'LK': 'LK', 'Meike': 'Meike', 'Minolta': 'Minolta',
    'Nikon': 'Nikon', 'Nikkor': 'Nikon', 'NiSi': 'NiSi', 'Olympus': 'Olympus',
    'Panasonic': 'Panasonic', 'Pentax': 'Pentax', 'Samsung': 'Samsung',
    'Samyang': 'Samyang', 'Schneider': 'Schneider-Kreuznach',
    'Sigma': 'Sigma', 'Sirui': 'Sirui', 'Sony': 'Sony',
    'Tamron': 'Tamron', 'Tokina': 'Tokina', 'Viltrox': 'Viltrox',
    'Voigtlander': 'Voigtländer', 'Zeiss': 'Carl Zeiss', 'Hartblei': 'Hartblei',
    'Mamiya': 'Mamiya', 'Komura': 'Komura', 'Rollei': 'Rollei',
    'Exakta': 'Exakta', 'Contax': 'Contax',
  };
  const firstWord = name.split(' ')[0];
  return brandAliases[firstWord] || firstWord;
}

function parseAperture(str) {
  if (!str) return null;
  const m = str.match(/[fF]\/?\s*(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function parseFocal(str) {
  if (!str) return null;
  const range = str.match(/(\d+\.?\d*)\s*(?:-\s*(\d+\.?\d*))?\s*mm/i);
  if (!range) return null;
  return {
    min: parseFloat(range[1]),
    max: range[2] ? parseFloat(range[2]) : parseFloat(range[1]),
  };
}

function parseWeight(str) {
  if (!str) return null;
  const m = str.match(/(\d+\.?\d*)\s*g/);
  return m ? parseFloat(m[1]) : null;
}

function parseMinFocus(str) {
  if (!str) return null;
  const m = str.match(/(\d+\.?\d*)\s*m/);
  return m ? parseFloat(m[1]) : null;
}

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

console.log(`Importing ${lenses.length} lenses (dryRun=${dryRun})`);

let inserted = 0;
let imagesUploaded = 0;
let errors = 0;

for (let i = 0; i < lenses.length; i++) {
  const lens = lenses[i];
  const slug = generateSlug(lens.name);
  const brand = extractBrand(lens.name);
  const focal = parseFocal(lens.focalLength || lens.name);
  const maxAperture = parseAperture(lens.maxAperture || lens.name);
  const minAperture = parseAperture(lens.minAperture);
  const weight = parseWeight(lens.specs?.Weight);
  const minFocus = parseMinFocus(lens.specs?.['Min focus']);
  const systemId = findSystemId(lens.lensMount);
  const isZoom = focal && focal.min !== focal.max;
  const isPrime = focal && focal.min === focal.max;
  const isMacro = lens.name.toLowerCase().includes('macro');
  const hasAF = lens.name.toLowerCase().includes(' af ') ||
                (lens.specs?.['Autofocus'] && lens.specs['Autofocus'] !== 'No');
  const hasStab = lens.specs?.['Image stab.'] === 'Yes' ||
                  lens.name.toLowerCase().includes(' is ') ||
                  lens.name.toLowerCase().includes(' ois ') ||
                  lens.name.toLowerCase().includes(' vr ') ||
                  lens.name.toLowerCase().includes(' oss ');

  // Upload images to R2
  const r2Images = [];
  if (lens.images && lens.images.length > 0) {
    for (let j = 0; j < lens.images.length; j++) {
      const imgUrl = typeof lens.images[j] === 'string' ? lens.images[j] : lens.images[j].src;
      const r2Key = `lenses/${lens.dpreviewSlug}/${j + 1}.webp`;

      if (dryRun) {
        r2Images.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: lens.name });
        continue;
      }

      try {
        const exists = await objectExists(r2Key);
        if (exists) {
          r2Images.push({ src: `${R2_PUBLIC_URL}/${r2Key}`, alt: lens.name });
          continue;
        }
        const publicUrl = await downloadResizeUpload(imgUrl, r2Key);
        if (publicUrl) {
          r2Images.push({ src: publicUrl, alt: lens.name });
          imagesUploaded++;
        }
      } catch (err) {
        console.error(`  Image error: ${r2Key}: ${err.message}`);
      }
    }
  }

  if (!dryRun) {
    try {
      await sql`INSERT INTO lenses (
        name, slug, brand, system_id, lens_type,
        focal_length_min, focal_length_max, aperture_min, aperture_max,
        weight_g, min_focus_distance_m, year_introduced,
        is_zoom, is_prime, is_macro, has_autofocus, has_stabilization,
        specs, images, verified
      ) VALUES (
        ${lens.name}, ${slug}, ${brand}, ${systemId}, ${lens.lensType || null},
        ${focal?.min || null}, ${focal?.max || null}, ${maxAperture}, ${minAperture},
        ${weight}, ${minFocus}, ${lens.yearIntroduced || null},
        ${isZoom}, ${isPrime}, ${isMacro}, ${hasAF}, ${hasStab},
        ${JSON.stringify(lens.specs || {})}, ${JSON.stringify(r2Images)}, ${true}
      )`;
      inserted++;
    } catch (err) {
      console.error(`  Insert error for ${lens.name}: ${err.message}`);
      errors++;
    }
  } else {
    inserted++;
  }

  if ((i + 1) % 25 === 0) {
    console.log(`  [${i + 1}/${lenses.length}] ${inserted} inserted, ${imagesUploaded} images, ${errors} errors`);
  }

  if (!dryRun) await delay(200);
}

console.log(`\nDone! (dryRun=${dryRun})`);
console.log(`  Total: ${lenses.length}`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Images uploaded: ${imagesUploaded}`);
console.log(`  Errors: ${errors}`);
