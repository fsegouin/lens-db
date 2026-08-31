#!/usr/bin/env node

/**
 * One-off repair for the eBay price-rotation queue.
 *
 * From 2026-07-24 eBay put sold-listings search behind a sign-in wall; the
 * scrapers silently got 0 listings for every item but still POSTed, which
 * bumped price_estimates.extracted_at (~800 items/day) and rotated the items
 * out of the scrape queue with no data.
 *
 * This resets extracted_at to a sentinel (2000-01-01) for rows bumped in the
 * broken window that have no price_history rows from it, so they rejoin the
 * queue right behind never-scraped items (batch query orders by
 * extracted_at ASC NULLS FIRST, view_count DESC). extracted_at is NOT NULL,
 * hence the sentinel instead of NULL.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/repair-price-rotation.mjs --dry-run
 *   DATABASE_URL=... node scripts/repair-price-rotation.mjs --until 2026-09-01T00:00:00Z
 *
 * --until must be a timestamp from just before the fixed pipeline's first
 * successful run, so post-fix scrapes are never reset.
 */

import { neon } from "@neondatabase/serverless";
import { parseArgs } from "node:util";

const BROKEN_SINCE = "2026-07-24T00:00:00Z";
const SENTINEL = "2000-01-01T00:00:00Z";

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      until: { type: "string" },
    },
  });
  const dryRun = values["dry-run"];
  const until = values.until;

  if (!dryRun && !until) {
    throw new Error(
      "--until <ISO timestamp> is required for a real run (use a timestamp just " +
        "before the fixed pipeline's first successful run)"
    );
  }
  if (until && Number.isNaN(Date.parse(until))) {
    throw new Error(`--until is not a valid timestamp: ${until}`);
  }
  const untilTs = until ?? new Date().toISOString();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const sql = neon(databaseUrl);
  const prefix = dryRun ? "[DRY RUN] " : "";

  console.log(`${prefix}Repairing price rotation for the broken window`);
  console.log(`  window: ${BROKEN_SINCE} → ${untilTs}\n`);

  const counts = await sql`
    SELECT pe.entity_type, COUNT(*)::int AS count
    FROM price_estimates pe
    WHERE pe.extracted_at >= ${BROKEN_SINCE}
      AND pe.extracted_at < ${untilTs}
      AND pe.entity_type IN ('lens', 'camera')
      AND NOT EXISTS (
        SELECT 1 FROM price_history ph
        WHERE ph.entity_type = pe.entity_type
          AND ph.entity_id = pe.entity_id
          AND ph.extracted_at >= ${BROKEN_SINCE}
      )
    GROUP BY pe.entity_type
    ORDER BY pe.entity_type
  `;
  if (counts.length === 0) {
    console.log("Nothing to repair.");
    return;
  }
  for (const row of counts) {
    console.log(`  ${row.entity_type}: ${row.count} items to re-queue`);
  }

  if (dryRun) {
    console.log(`\n${prefix}No changes made.`);
    return;
  }

  const updated = await sql`
    UPDATE price_estimates pe
    SET extracted_at = ${SENTINEL}
    WHERE pe.extracted_at >= ${BROKEN_SINCE}
      AND pe.extracted_at < ${untilTs}
      AND pe.entity_type IN ('lens', 'camera')
      AND NOT EXISTS (
        SELECT 1 FROM price_history ph
        WHERE ph.entity_type = pe.entity_type
          AND ph.entity_id = pe.entity_id
          AND ph.extracted_at >= ${BROKEN_SINCE}
      )
    RETURNING pe.entity_type
  `;
  console.log(`\nReset extracted_at to ${SENTINEL} for ${updated.length} rows.`);
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
