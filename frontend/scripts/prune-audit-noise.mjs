/**
 * One-off cleanup: prune noise from queued "LLM spec audit" correction edits.
 * Applies the same deterministic rules as the audit route's isNoiseIssue():
 * notation-equal values, <5% rounding deltas, apertureMax==apertureMin
 * confusion, lensType refinements. Edits left with no substantive correction
 * are rejected; others are trimmed in place.
 *
 * Usage: DATABASE_URL=... node scripts/prune-audit-noise.mjs [--dry-run]
 */

import { createSql } from './lib/db.mjs';

const sql = createSql();
const dryRun = process.argv.includes('--dry-run');

const NUMERIC_FIELDS = new Set([
  'focalLengthMin', 'focalLengthMax', 'apertureMin', 'apertureMax',
  'weightG', 'filterSizeMm', 'minFocusDistanceM', 'maxMagnification',
  'lensElements', 'lensGroups', 'diaphragmBlades', 'yearIntroduced',
]);

function isNoise(field, suggestedRaw, correctionValue, lens) {
  if (NUMERIC_FIELDS.has(field)) {
    const s = typeof correctionValue === 'number'
      ? correctionValue
      : parseFloat(String(suggestedRaw ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(s)) return true;
    const colMap = {
      focalLengthMin: 'focal_length_min', focalLengthMax: 'focal_length_max',
      apertureMin: 'aperture_min', apertureMax: 'aperture_max',
      weightG: 'weight_g', filterSizeMm: 'filter_size_mm',
      minFocusDistanceM: 'min_focus_distance_m', maxMagnification: 'max_magnification',
      lensElements: 'lens_elements', lensGroups: 'lens_groups',
      diaphragmBlades: 'diaphragm_blades', yearIntroduced: 'year_introduced',
    };
    const cur = lens[colMap[field]];
    if (typeof cur === 'number') {
      if (s === cur) return true;
      const rel = Math.abs(s - cur) / Math.max(Math.abs(cur), 1e-9);
      if (rel < 0.05) return true;
    }
    if (field === 'apertureMax' && typeof lens.aperture_min === 'number' && s === lens.aperture_min) {
      return true;
    }
    return false;
  }
  if (field === 'lensType' && typeof lens.lens_type === 'string' && correctionValue) {
    const a = lens.lens_type.toLowerCase();
    const b = String(correctionValue).toLowerCase();
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

const edits = await sql`
  SELECT id, entity_id, changes FROM pending_edits
  WHERE summary LIKE 'LLM spec audit:%' AND status = 'pending' AND entity_type = 'lens'`;
console.log(`${edits.length} audit correction edits to prune (dryRun=${dryRun})`);

let rejected = 0;
let trimmed = 0;
let untouched = 0;

for (const edit of edits) {
  const [lens] = await sql`SELECT * FROM lenses WHERE id = ${edit.entity_id}`;
  if (!lens) continue;

  const { _audit = [], ...corrections } = edit.changes;
  const kept = {};
  const keptIssues = [];
  for (const [field, value] of Object.entries(corrections)) {
    const issue = _audit.find((i) => i.field === field);
    if (isNoise(field, issue?.suggestedValue, value, lens)) continue;
    kept[field] = value;
    if (issue) keptIssues.push(issue);
  }

  const droppedCount = Object.keys(corrections).length - Object.keys(kept).length;
  if (Object.keys(kept).length === 0) {
    rejected++;
    if (!dryRun) {
      await sql`UPDATE pending_edits SET status = 'rejected', reject_reason = 'Audit noise (notation/rounding) — auto-pruned', reviewed_at = now() WHERE id = ${edit.id}`;
    }
  } else if (droppedCount > 0) {
    trimmed++;
    if (!dryRun) {
      await sql`UPDATE pending_edits SET changes = ${JSON.stringify({ ...kept, _audit: keptIssues })} WHERE id = ${edit.id}`;
    }
  } else {
    untouched++;
  }
}

console.log(`Done: ${rejected} rejected as pure noise, ${trimmed} trimmed, ${untouched} untouched (all substantive)`);
