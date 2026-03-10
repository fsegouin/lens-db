/**
 * Assign newly imported lenses to existing and new series.
 * Creates missing series, then adds memberships.
 *
 * Usage: node scripts/assign-lens-series.mjs [--dry-run]
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

// Load existing series
const existingSeries = await sql`SELECT id, name, slug FROM lens_series ORDER BY name`;
const seriesByName = new Map();
existingSeries.forEach(s => seriesByName.set(s.name.toLowerCase(), s));

// Load all lenses (we'll assign series to ALL lenses missing memberships, not just new ones)
const allLenses = await sql`
  SELECT l.id, l.name, l.brand
  FROM lenses l
  LEFT JOIN lens_series_memberships m ON l.id = m.lens_id
  WHERE m.lens_id IS NULL
`;

console.log(`Lenses without any series membership: ${allLenses.length}`);

// Series detection rules: [regex pattern on lens name, series name, series slug]
const SERIES_RULES = [
  // Sigma
  [/\bSigma\b.*\|\s*A\b/i, 'Sigma Art', 'sigma-art'],
  [/\bSigma\b.*\|\s*C\b/i, 'Sigma Contemporary', 'sigma-contemporary'],
  [/\bSigma\b.*\|\s*S\b/i, 'Sigma Sports', 'sigma-sports'],
  [/\bSigma\b.*\bEX\b/i, 'Sigma EX', 'sigma-ex'],
  [/\bSigma\b.*\bDC\b/i, 'Sigma DC', 'sigma-dc'],
  [/\bSigma\b.*\bDG\b/i, 'Sigma DG', 'sigma-dg'],

  // Canon
  [/\bCanon\b.*\bRF-S\b/i, 'Canon RF-S', 'canon-rf-s'],
  [/\bCanon\b.*\bRF\b/i, 'Canon RF', 'canon-rf'],
  [/\bCanon\b.*\bEF-S\b/i, 'Canon EF-S', 'canon-ef-s'],
  [/\bCanon\b.*\bEF-M\b/i, 'Canon EF-M', 'canon-ef-m'],
  [/\bCanon\b.*\bEF\b/i, 'Canon EF', 'canon-ef'],
  [/\bCanon\b.*\b[0-9].*L\b/i, 'Canon L', 'canon-l'],

  // Nikon
  [/\bNikon\b.*\bNikkor Z\b/i, 'Nikon Z Nikkor', 'nikon-z-nikkor'],
  [/\bNikkor Z\b/i, 'Nikon Z Nikkor', 'nikon-z-nikkor'],
  [/\bNikon\b.*\bAF-S\b/i, 'Nikon AF-S Nikkor', 'nikon-af-s-nikkor'],
  [/\bNikon\b.*\bAF-P\b/i, 'Nikon AF-P Nikkor', 'nikon-af-p-nikkor'],
  [/\bNikon\b.*\bAF\b/i, 'Nikon AF Nikkor', 'nikon-af-nikkor'],

  // Sony
  [/\bSony\b.*\bFE\b.*\bGM\b/i, 'Sony FE G Master', 'sony-fe-g-master'],
  [/\bSony\b.*\bFE\b.*\bG\b/i, 'Sony FE G', 'sony-fe-g'],
  [/\bSony\b.*\bFE\b/i, 'Sony FE', 'sony-fe'],
  [/\bSony\b.*\bE\b/i, 'Sony E', 'sony-e'],
  [/\bSony\b.*\bDT\b/i, 'Sony DT', 'sony-dt'],

  // Fujifilm
  [/\b(?:Fujifilm|Fujinon)\b.*\bXF\b/i, 'Fujifilm XF', 'fujifilm-xf'],
  [/\b(?:Fujifilm|Fujinon)\b.*\bXC\b/i, 'Fujifilm XC', 'fujifilm-xc'],
  [/\b(?:Fujifilm|Fujinon)\b.*\bGF\b/i, 'Fujifilm GF', 'fujifilm-gf'],

  // Tamron
  [/\bTamron\b.*\bSP\b/i, 'Tamron SP', 'tamron-sp'],
  [/\bTamron\b.*\bDi III\b/i, 'Tamron Di III', 'tamron-di-iii'],
  [/\bTamron\b.*\bDi II\b/i, 'Tamron Di II', 'tamron-di-ii'],
  [/\bTamron\b.*\bDi\b/i, 'Tamron Di', 'tamron-di'],

  // Zeiss
  [/\b(?:Zeiss|ZEISS)\b.*\bOtus\b/i, 'ZEISS Otus', 'zeiss-otus'],
  [/\b(?:Zeiss|ZEISS)\b.*\bMilvus\b/i, 'ZEISS Milvus', 'zeiss-milvus'],
  [/\b(?:Zeiss|ZEISS)\b.*\bBatis\b/i, 'ZEISS Batis', 'zeiss-batis'],
  [/\b(?:Zeiss|ZEISS)\b.*\bLoxia\b/i, 'ZEISS Loxia', 'zeiss-loxia'],
  [/\b(?:Zeiss|ZEISS)\b.*\bTouit\b/i, 'ZEISS Touit', 'zeiss-touit'],

  // Panasonic
  [/\bPanasonic\b.*\bLumix S Pro\b/i, 'Panasonic Lumix S Pro', 'panasonic-lumix-s-pro'],
  [/\bPanasonic\b.*\bLumix S\b/i, 'Panasonic Lumix S', 'panasonic-lumix-s'],
  [/\bPanasonic\b.*\bLeica DG\b/i, 'Panasonic Leica DG', 'panasonic-leica-dg'],
  [/\bPanasonic\b.*\bLumix G\b/i, 'Panasonic Lumix G', 'panasonic-lumix-g'],

  // Olympus / OM System
  [/\b(?:Olympus|OM System)\b.*\bM\.?Zuiko.*\bPro\b/i, 'Olympus M.Zuiko Pro', 'olympus-m-zuiko-pro'],
  [/\b(?:Olympus|OM System)\b.*\bM\.?Zuiko\b/i, 'Olympus M.Zuiko', 'olympus-m-zuiko'],

  // Leica
  [/\bLeica\b.*\bSummilux\b/i, 'Leica Summilux', 'leica-summilux'],
  [/\bLeica\b.*\bSummicron\b/i, 'Leica Summicron', 'leica-summicron'],
  [/\bLeica\b.*\bElmarit\b/i, 'Leica Elmarit', 'leica-elmarit'],
  [/\bLeica\b.*\bNoctilux\b/i, 'Leica Noctilux', 'leica-noctilux'],
  [/\bLeica\b.*\bSummarit\b/i, 'Leica Summarit', 'leica-summarit'],
  [/\bLeica\b.*\bSummaron\b/i, 'Leica Summaron', 'leica-summaron'],
  [/\bLeica\b.*\bSuper-Elmar\b/i, 'Leica Super-Elmar', 'leica-super-elmar'],
  [/\bLeica\b.*\bTelyt\b/i, 'Leica Telyt', 'leica-telyt'],
  [/\bLeica\b.*\bAPO\b/i, 'Leica APO', 'leica-apo'],

  // Pentax
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bDA\*\b/i, 'Pentax DA Star', 'pentax-da-star'],
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bD FA\*\b/i, 'Pentax D FA Star', 'pentax-d-fa-star'],
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bD FA\b/i, 'Pentax D FA', 'pentax-d-fa'],
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bDA\b/i, 'Pentax DA', 'pentax-da'],
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bFA\b/i, 'Pentax FA', 'pentax-fa'],
  [/\b(?:Pentax|smc Pentax|HD Pentax)\b.*\bLimited\b/i, 'Pentax Limited', 'pentax-limited'],

  // Voigtlander
  [/\bVoigtlander\b.*\bNokton\b/i, 'Voigtlander Nokton', 'voigtlander-nokton'],
  [/\bVoigtlander\b.*\bUltron\b/i, 'Voigtlander Ultron', 'voigtlander-ultron'],
  [/\bVoigtlander\b.*\bColor.?Skopar\b/i, 'Voigtlander Color-Skopar', 'voigtlander-color-skopar'],
  [/\bVoigtlander\b.*\bHeliar\b/i, 'Voigtlander Heliar', 'voigtlander-heliar'],
  [/\bVoigtlander\b.*\bAPO-?Lanthar\b/i, 'Voigtlander APO-Lanthar', 'voigtlander-apo-lanthar'],

  // Samyang
  [/\bSamyang\b.*\bXP\b/i, 'Samyang XP', 'samyang-xp'],
  [/\bSamyang\b/i, 'Samyang', 'samyang'],

  // Newer / third-party brands (new series)
  [/\bViltrox\b/i, 'Viltrox', 'viltrox'],
  [/\b7[Aa]rtisans\b/i, '7Artisans', '7artisans'],
  [/\b(?:Laowa|Venus)\b/i, 'Laowa', 'laowa'],
  [/\bSirui\b/i, 'Sirui', 'sirui'],
  [/\bMeike\b/i, 'Meike', 'meike'],
  [/\bKamlan\b/i, 'Kamlan', 'kamlan'],
  [/\bLensbaby\b/i, 'Lensbaby', 'lensbaby'],
  [/\bIrix\b/i, 'Irix', 'irix'],
  [/\bTokina\b.*\bFiRIN\b/i, 'Tokina FiRIN', 'tokina-firin'],
  [/\bTokina\b.*\batx\b/i, 'Tokina atx', 'tokina-atx'],
  [/\bKenko\b.*\bTeleplus\b/i, 'Kenko Teleplus', 'kenko-teleplus'],
  [/\bNiSi\b/i, 'NiSi', 'nisi'],
  [/\bHartblei\b/i, 'Hartblei', 'hartblei'],
  [/\bSchneider\b/i, 'Schneider', 'schneider'],
  [/\bHolga\b/i, 'Holga', 'holga'],

  // Samsung
  [/\bSamsung\b.*\bNX-M\b/i, 'Samsung NX-M', 'samsung-nx-m'],
  [/\bSamsung\b/i, 'Samsung NX', 'samsung-nx'],

  // Pentax Q
  [/\bPentax\b.*\b0[1-9]\b/i, 'Pentax Q', 'pentax-q'],

  // Nikon 1
  [/\bNikon\b.*\b1 NIKKOR\b/i, 'Nikon 1 Nikkor', 'nikon-1-nikkor'],
];

// Match lenses to series
const assignments = []; // { lensId, seriesName, seriesSlug }

for (const lens of allLenses) {
  for (const [pattern, seriesName, seriesSlug] of SERIES_RULES) {
    if (pattern.test(lens.name)) {
      assignments.push({ lensId: lens.id, lensName: lens.name, seriesName, seriesSlug });
      break; // first match wins (rules are ordered by specificity)
    }
  }
}

console.log(`\nSeries assignments to make: ${assignments.length}`);

// Find which series need to be created
const seriesToCreate = new Map();
for (const a of assignments) {
  if (!seriesByName.has(a.seriesName.toLowerCase()) && !seriesToCreate.has(a.seriesSlug)) {
    seriesToCreate.set(a.seriesSlug, { name: a.seriesName, slug: a.seriesSlug });
  }
}

console.log(`New series to create: ${seriesToCreate.size}`);
for (const [slug, s] of seriesToCreate) {
  console.log(`  ${s.name} (${slug})`);
}

if (!dryRun) {
  // Create new series
  for (const [, s] of seriesToCreate) {
    try {
      const [created] = await sql`INSERT INTO lens_series (name, slug) VALUES (${s.name}, ${s.slug}) RETURNING id, name`;
      seriesByName.set(created.name.toLowerCase(), created);
      console.log(`  Created series: ${created.name} (id ${created.id})`);
    } catch (err) {
      // May already exist
      console.error(`  Error creating ${s.name}: ${err.message}`);
      const [existing] = await sql`SELECT id, name FROM lens_series WHERE slug = ${s.slug}`;
      if (existing) seriesByName.set(existing.name.toLowerCase(), existing);
    }
  }

  // Insert memberships
  let added = 0;
  let skipped = 0;
  for (const a of assignments) {
    const series = seriesByName.get(a.seriesName.toLowerCase());
    if (!series) {
      console.error(`  No series found for ${a.seriesName}`);
      continue;
    }
    try {
      await sql`INSERT INTO lens_series_memberships (lens_id, series_id) VALUES (${a.lensId}, ${series.id}) ON CONFLICT DO NOTHING`;
      added++;
    } catch (err) {
      skipped++;
    }
  }
  console.log(`\nMemberships added: ${added}, skipped: ${skipped}`);
} else {
  // Dry run: show breakdown
  const bySeriesName = {};
  for (const a of assignments) {
    bySeriesName[a.seriesName] = (bySeriesName[a.seriesName] || 0) + 1;
  }
  console.log('\nAssignments by series:');
  Object.entries(bySeriesName).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    const isNew = seriesToCreate.has(name.toLowerCase().replace(/\s+/g, '-'));
    console.log(`  ${name}: ${count}${isNew ? ' (NEW)' : ''}`);
  });
}
