/**
 * DPReview Camera Scraper Runner
 *
 * Run this after collecting scraped data via the browser automation.
 * It matches scraped cameras against the DB and prepares insert/update statements.
 *
 * Usage: node scripts/scrape-dpreview-runner.mjs <scraped-data.json>
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

// Load scraped data
const dataFile = process.argv[2] || '../dpreview-scraped-cameras.json';
const scraped = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

// Load existing cameras
const existing = await sql`SELECT id, name, slug, images FROM cameras`;

// Normalize for matching
const normalizeName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const existingByNorm = new Map();
existing.forEach(c => {
  existingByNorm.set(normalizeName(c.name), c);
});

// Load systems for mount matching
const systems = await sql`SELECT id, name FROM systems`;
const systemsByName = new Map();
systems.forEach(s => systemsByName.set(s.name.toLowerCase(), s));

// Mount name to system mapping
const MOUNT_MAP = {
  'nikon z': 'nikon z',
  'nikon f': 'nikon f',
  'nikon 1': 'nikon 1',
  'canon rf-s': 'canon rf-s',
  'canon rf': 'canon rf',
  'canon ef/ef-s': 'canon ef',
  'canon ef-s': 'canon ef',
  'canon ef-m': 'canon ef-m',
  'canon ef': 'canon ef',
  'sony e': 'sony e',
  'sony/minolta alpha': 'sony a',
  'sony a': 'sony a',
  'fujifilm x': 'fujifilm x',
  'fujifilm g': 'fujifilm g',
  'micro four thirds': 'micro four thirds',
  'four thirds': 'four thirds',
  'pentax q': 'pentax q',
  'pentax k': 'pentax k',
  'pentax ka': 'pentax k',
  'samsung nx-m': 'samsung nx-m',
  'samsung nx': 'samsung nx',
  'leica m': 'leica m',
  'leica l': 'leica l',
  'leica t': 'leica l',
  'leica sl': 'leica l',
  'sigma sa': 'sigma sa',
  'hasselblad x': 'hasselblad x',
};

function findSystemId(mount) {
  if (!mount) return null;
  const mountLower = mount.toLowerCase();
  for (const [key, sysName] of Object.entries(MOUNT_MAP)) {
    if (mountLower.includes(key)) {
      for (const [name, sys] of systemsByName) {
        if (name === sysName || name.includes(sysName)) {
          return sys.id;
        }
      }
    }
  }
  return null;
}

function generateSlug(name, year) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return year ? `camera/${base}-${year}` : `camera/${base}`;
}

// Normalize dpreview spec keys to match the standard keys used in the DB/UI
function normalizeSpecs(dpSpecs) {
  if (!dpSpecs || Object.keys(dpSpecs).length === 0) return {};

  const normalized = {};

  // Type = shutter type. All digital ILCs are focal-plane.
  // Compact cameras with fixed lenses use leaf shutters.
  const bodyType = dpSpecs['Body type'] || '';
  const lensMount = dpSpecs['Lens mount'] || '';
  if (lensMount) {
    // Interchangeable lens = focal-plane shutter
    normalized['Type'] = 'Focal-plane';
  } else if (bodyType.toLowerCase().includes('compact') || bodyType.toLowerCase().includes('ultracompact')) {
    normalized['Type'] = 'Leaf shutter';
  }

  // Model = shutter control. All digital cameras are electronically controlled.
  normalized['Model'] = 'Electronically controlled';

  // Imaging sensor = dimensions + type combined (e.g. "35.6 × 23.8mm BSI-CMOS sensor")
  const sensorType = dpSpecs['Sensor type'];
  const sensorSize = dpSpecs['Sensor size'];
  if (sensorType) {
    // Extract dimensions from sensor size like "Full frame (35.6 x 23.8 mm)"
    const dimMatch = sensorSize?.match(/\(([^)]+)\)/);
    if (dimMatch) {
      const dims = dimMatch[1].replace(/ x /g, ' × ').replace(/ mm/, 'mm');
      normalized['Imaging sensor'] = `${dims} ${sensorType} sensor`;
    } else {
      normalized['Imaging sensor'] = `${sensorType} sensor`;
    }
  }

  // Direct mappings
  if (sensorSize) normalized['Maximum format'] = sensorSize.replace(/\s*\([^)]+\)/, '').trim();
  if (dpSpecs['Effective pixels']) normalized['Effective pixels'] = dpSpecs['Effective pixels'];
  if (dpSpecs['Max resolution']) normalized['Max resolution'] = dpSpecs['Max resolution'];
  if (dpSpecs['Lens mount']) normalized['Lens mount'] = dpSpecs['Lens mount'];
  if (dpSpecs['Focal length mult.']) normalized['Crop factor'] = dpSpecs['Focal length mult.'];
  if (dpSpecs['Max shutter speed']) normalized['Speeds'] = dpSpecs['Max shutter speed'];
  if (dpSpecs['Articulated LCD']) normalized['Articulated LCD'] = dpSpecs['Articulated LCD'];
  if (dpSpecs['Screen size']) normalized['Screen size'] = dpSpecs['Screen size'];
  if (dpSpecs['Screen dots']) normalized['Screen dots'] = dpSpecs['Screen dots'];
  if (dpSpecs['Format']) normalized['Format'] = dpSpecs['Format'];
  if (dpSpecs['Storage types']) normalized['Storage types'] = dpSpecs['Storage types'];
  if (dpSpecs['USB']) normalized['USB'] = dpSpecs['USB'];
  if (dpSpecs['Weight (inc. batteries)']) normalized['Weight'] = dpSpecs['Weight (inc. batteries)'];
  if (dpSpecs['Dimensions']) normalized['Dimensions'] = dpSpecs['Dimensions'];
  if (dpSpecs['GPS'] && dpSpecs['GPS'] !== 'None') normalized['GPS'] = dpSpecs['GPS'];
  if (dpSpecs['ISO']) normalized['ISO'] = dpSpecs['ISO'];
  if (dpSpecs['Body type']) normalized['Body type'] = dpSpecs['Body type'];

  // No Film type for digital cameras - leave it null
  return normalized;
}

const toInsert = [];
const toUpdateImages = [];
const skipped = [];

for (const cam of scraped) {
  if (!cam.name) {
    skipped.push({ dpreviewSlug: cam.dpreviewSlug, reason: 'no name' });
    continue;
  }

  const norm = normalizeName(cam.name);
  const match = existingByNorm.get(norm);

  if (match) {
    // Existing camera - update images if we have new ones and they don't have any
    const existingImages = match.images || [];
    if (cam.images?.length > 0 && (!existingImages || existingImages.length === 0)) {
      toUpdateImages.push({
        id: match.id,
        name: match.name,
        slug: match.slug,
        images: cam.images,
      });
    }
  } else {
    // New camera
    toInsert.push({
      name: cam.name,
      slug: generateSlug(cam.name, cam.yearIntroduced),
      sensorType: cam.sensorType,
      sensorSize: cam.sensorSize?.replace(/\s*\([^)]+\)/, '') || null, // Remove dimensions in parens
      megapixels: cam.megapixels,
      resolution: cam.resolution,
      yearIntroduced: cam.yearIntroduced,
      bodyType: cam.bodyType,
      weightG: cam.weightG,
      systemId: findSystemId(cam.lensMount),
      lensMount: cam.lensMount,
      specs: normalizeSpecs(cam.specs),
      images: cam.images || [],
      dpreviewSlug: cam.dpreviewSlug,
    });
  }
}

console.log('=== RESULTS ===');
console.log(`Total scraped: ${scraped.length}`);
console.log(`To insert (new): ${toInsert.length}`);
console.log(`To update images: ${toUpdateImages.length}`);
console.log(`Skipped: ${skipped.length}`);
console.log(`Already exist (no changes): ${scraped.length - toInsert.length - toUpdateImages.length - skipped.length}`);

// Write output files
fs.writeFileSync('../dpreview-cameras-to-insert.json', JSON.stringify(toInsert, null, 2));
fs.writeFileSync('../dpreview-cameras-to-update-images.json', JSON.stringify(toUpdateImages, null, 2));

console.log('\nWrote dpreview-cameras-to-insert.json');
console.log('Wrote dpreview-cameras-to-update-images.json');

if (toInsert.length > 0) {
  console.log('\n=== NEW CAMERAS TO INSERT ===');
  toInsert.forEach(c => console.log(`  ${c.name} (${c.yearIntroduced || '?'}) [${c.lensMount || '?'}] - ${c.images.length} images`));
}

if (toUpdateImages.length > 0) {
  console.log('\n=== EXISTING CAMERAS TO UPDATE IMAGES ===');
  toUpdateImages.forEach(c => console.log(`  ${c.name} - ${c.images.length} images`));
}
