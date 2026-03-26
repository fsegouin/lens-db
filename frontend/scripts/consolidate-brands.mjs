/**
 * Brand consolidation migration + tags table creation.
 *
 * Consolidates brand variants into canonical names and creates
 * a lightweight tags system (tags + lens_tags tables).
 *
 * Usage:
 *   node scripts/consolidate-brands.mjs [--dry-run]
 *
 * Requires DATABASE_URL in environment or .env.local
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  const envPath = resolve(process.cwd(), '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const sep = trimmed.indexOf('=');
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

// ─── Brand consolidation rules ───────────────────────────────────────────
// Each entry: [description, WHERE clause, target brand]
const BRAND_UPDATES = [
  // Angénieux (proper French spelling)
  ['Angenieux → Angénieux', `brand = 'Angenieux'`, 'Angénieux'],

  // Pentax family
  ['Asahi → Pentax', `brand = 'Asahi'`, 'Pentax'],
  ['Asahi Pentax → Pentax', `brand = 'Asahi Pentax'`, 'Pentax'],
  ['Asahiflex → Pentax', `brand = 'Asahiflex'`, 'Pentax'],
  ['Takumar* → Pentax', `brand ~ '^[Tt][Aa][Kk][Uu][Mm][Aa][Rr]'`, 'Pentax'],

  // Brightin Star (full brand name)
  ['Brightin → Brightin Star', `brand = 'Brightin'`, 'Brightin Star'],

  // Light Lens Lab (full brand name)
  ['Light → Light Lens Lab', `brand = 'Light'`, 'Light Lens Lab'],

  // MS Optics (full brand name)
  ['MS → MS Optics', `brand = 'MS'`, 'MS Optics'],

  // Tamron
  ['Tamron-F → Tamron', `brand = 'Tamron-F'`, 'Tamron'],

  // Komura family (all Sankyo Koki products)
  ['Komuranon → Komura', `brand = 'Komuranon'`, 'Komura'],
  ['KOMURANON → Komura', `brand = 'KOMURANON'`, 'Komura'],
  ['Komura-FX → Komura', `brand = 'Komura-FX'`, 'Komura'],

  // Meyer-Optik Görlitz
  ['Meyer → Meyer-Optik Görlitz', `brand = 'Meyer'`, 'Meyer-Optik Görlitz'],
  ['Meyer-Optik → Meyer-Optik Görlitz', `brand = 'Meyer-Optik'`, 'Meyer-Optik Görlitz'],

  // Rollei family (all product line prefixes → Rollei)
  ['ROLLEINAR → Rollei', `brand = 'ROLLEINAR'`, 'Rollei'],
  ['ROLLEINAR-MC → Rollei', `brand = 'ROLLEINAR-MC'`, 'Rollei'],
  ['Rolleinar → Rollei', `brand = 'Rolleinar'`, 'Rollei'],
  ['Rolleinar-MC → Rollei', `brand = 'Rolleinar-MC'`, 'Rollei'],
  ['F-ROLLEINAR-MC → Rollei', `brand = 'F-ROLLEINAR-MC'`, 'Rollei'],
  ['F-Rolleinar-MC → Rollei', `brand = 'F-Rolleinar-MC'`, 'Rollei'],
  ['HFT-Rolleinar → Rollei', `brand = 'HFT-Rolleinar'`, 'Rollei'],
  ['APO-Rolleinar → Rollei', `brand = 'APO-Rolleinar'`, 'Rollei'],
  ['Apo-Rolleinar → Rollei', `brand = 'Apo-Rolleinar'`, 'Rollei'],
  ['Reflex-ROLLEINAR → Rollei', `brand = 'Reflex-ROLLEINAR'`, 'Rollei'],
  ['Reflex-Rolleinar → Rollei', `brand = 'Reflex-Rolleinar'`, 'Rollei'],
  ['Zoom-Rolleinar → Rollei', `brand = 'Zoom-Rolleinar'`, 'Rollei'],
  ['Rollei-HFT → Rollei', `brand = 'Rollei-HFT'`, 'Rollei'],

  // Mamiya (SEKOR is the lens line, not a brand)
  ['Mamiya-SEKOR → Mamiya', `brand = 'Mamiya-SEKOR'`, 'Mamiya'],
  ['Mamiya/SEKOR → Mamiya', `brand = 'Mamiya/SEKOR'`, 'Mamiya'],
  ['Mamiya/Sekor → Mamiya', `brand = 'Mamiya/Sekor'`, 'Mamiya'],

  // Nikon family
  ['Nippon Kogaku → Nikon', `brand = 'Nippon Kogaku'`, 'Nikon'],
  ['Nippon → Nikon', `brand = 'Nippon'`, 'Nikon'],
  ['Nikkor → Nikon', `brand = 'Nikkor'`, 'Nikon'],
  ['NIKKOREX → Nikon', `brand = 'NIKKOREX'`, 'Nikon'],
  ['Nikkorex → Nikon', `brand = 'Nikkorex'`, 'Nikon'],

  // Exakta (Exaktar is the lens sub-brand, like Nikkor)
  ['Exaktar → Exakta', `brand = 'Exaktar'`, 'Exakta'],

  // Fuji family → Fuji (keeping existing dominant name)
  ['Fujica → Fuji', `brand = 'Fujica'`, 'Fuji'],
  ['Fujifilm → Fuji', `brand = 'Fujifilm'`, 'Fuji'],

  // Soviet lenses — case normalization + strip model numbers from brand
  // INDUSTAR-* and Industar-* → Industar
  ['INDUSTAR-* → Industar', `brand ~ '^INDUSTAR'`, 'Industar'],
  ['Industar-* (lowercase variants) → Industar', `brand ~ '^Industar' AND brand != 'Industar'`, 'Industar'],

  // JUPITER-* and Jupiter-* → Jupiter
  ['JUPITER-* → Jupiter', `brand ~ '^JUPITER'`, 'Jupiter'],
  ['Jupiter-* variants → Jupiter', `brand ~ '^Jupiter' AND brand != 'Jupiter'`, 'Jupiter'],

  // MTO-* → MTO
  ['MTO-* variants → MTO', `brand ~ '^MTO' AND brand != 'MTO'`, 'MTO'],

  // MIR-* and Mir-* → Mir (careful: not Miranda, Mirax)
  ['MIR-* → Mir', `brand ~ '^MIR-'`, 'Mir'],
  ['Mir-* → Mir', `brand ~ '^Mir-'`, 'Mir'],
];

// ─── Execute ─────────────────────────────────────────────────────────────

console.log(`\n=== Brand Consolidation Migration ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// Step 1: Show current state
const beforeCounts = await sql`
  SELECT brand, COUNT(*)::int AS cnt
  FROM lenses
  GROUP BY brand
  ORDER BY brand
`;
const brandMap = new Map(beforeCounts.map(r => [r.brand, r.cnt]));

let totalUpdated = 0;

for (const [desc, whereClause, targetBrand] of BRAND_UPDATES) {
  // Count affected rows first
  const countResult = await sql.query(`SELECT COUNT(*)::int AS cnt FROM lenses WHERE ${whereClause}`);
  const count = countResult[0].cnt;

  if (count === 0) {
    // Skip silently
    continue;
  }

  console.log(`  ${desc}: ${count} lenses`);

  if (!dryRun) {
    await sql.query(`UPDATE lenses SET brand = '${targetBrand}' WHERE ${whereClause}`);
  }

  totalUpdated += count;
}

console.log(`\nTotal lenses updated: ${totalUpdated}`);

// Step 2: Create tags tables
console.log('\n=== Creating tags tables ===\n');

if (!dryRun) {
  await sql`
    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS lens_tags (
      lens_id INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (lens_id, tag_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_lens_tags_tag ON lens_tags(tag_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lens_tags_lens ON lens_tags(lens_id)`;

  console.log('  Created tags + lens_tags tables');
} else {
  console.log('  Would create tags + lens_tags tables');
}

// Step 3: Verify final state
console.log('\n=== Post-migration brand counts ===\n');

const afterCounts = await sql`
  SELECT brand, COUNT(*)::int AS cnt
  FROM lenses
  WHERE brand IN (
    'Angénieux', 'Pentax', 'Brightin Star', 'Light Lens Lab', 'MS Optics',
    'Tamron', 'Komura', 'Meyer-Optik Görlitz', 'Rollei', 'Mamiya',
    'Nikon', 'Exakta', 'Fuji', 'Industar', 'Jupiter', 'MTO', 'Mir'
  )
  GROUP BY brand
  ORDER BY cnt DESC
`;

for (const { brand, cnt } of afterCounts) {
  console.log(`  ${brand}: ${cnt}`);
}

// Check for any remaining variants that should have been caught
console.log('\n=== Checking for stragglers ===\n');
const stragglers = await sql`
  SELECT brand, COUNT(*)::int AS cnt
  FROM lenses
  WHERE brand ~* '(asahi|takumar|nikkor|nippon|rolleinar|mamiya.sekor|industar|jupiter|komura|mto-|mir-)'
    AND brand NOT IN ('Pentax', 'Nikon', 'Rollei', 'Mamiya', 'Industar', 'Jupiter', 'Komura', 'MTO', 'Mir')
  GROUP BY brand
  ORDER BY brand
`;

if (stragglers.length === 0) {
  console.log('  None found — all variants consolidated.');
} else {
  console.log('  WARNING: Unconsolidated variants remain:');
  for (const { brand, cnt } of stragglers) {
    console.log(`    ${brand}: ${cnt}`);
  }
}

console.log('\nDone.');
