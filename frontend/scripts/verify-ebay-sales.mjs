/**
 * Check every sale the Browse watcher recorded against the listing's own page,
 * and retract the ones the seller ended rather than sold.
 *
 * The Browse API reports a listing its seller pulled ("ended by the seller
 * because the item is no longer available") in the same shape as a sale: a
 * sold quantity, nothing remaining, a price. The resolver took that as a sale.
 * On 2026-09-12, 12 of 40 recorded sales sampled were seller-ended. Only the
 * page shows the difference, so this reads it.
 *
 * Only a page that says "ended by the seller" is acted on. "Sold on" confirms
 * the sale, and anything else (a block page, wording not recognised) is
 * reported and left alone. Confirmed sales are not marked, so a rerun checks
 * them again; the watch table keeps resolved rows for 30 days, which bounds
 * that.
 *
 * On --apply, per retracted listing and in one transaction: the price_history
 * row is deleted, pinned by id and source URL, and the watch row is marked
 * seller_ended. Before-values go to a JSONL backup first. The affected
 * estimates are then recomputed through the prod recompute-prices route,
 * which also revalidates their price cards.
 *
 * Usage (from frontend/, after `npm ci` in scraper/ for the browser):
 *   node scripts/verify-ebay-sales.mjs
 *   node scripts/verify-ebay-sales.mjs --apply
 *   node scripts/verify-ebay-sales.mjs --apply --backup ~/Work/ebay-seller-ended.before.jsonl
 *
 * Requires DATABASE_URL and CRON_SECRET (in .env.local). SITE_URL defaults to
 * https://thelensdb.com.
 */

import { createRequire } from "node:module";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createPool } from "./lib/db.mjs";
import { readListingOutcome } from "./lib/ebay-listing-page.mjs";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupArg = args.indexOf("--backup");
const backupPath =
  backupArg !== -1
    ? resolve(args[backupArg + 1].replace(/^~/, homedir()))
    : resolve(homedir(), "Work", `ebay-seller-ended.before.${new Date().toISOString().slice(0, 10)}.jsonl`);
const siteUrl = process.env.SITE_URL || "https://thelensdb.com";

if (apply && !process.env.CRON_SECRET) {
  console.error("CRON_SECRET is not set, so the estimates could not be recomputed afterwards");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = createRequire(new URL("../../scraper/package.json", import.meta.url))(
    "playwright-core",
  ));
} catch {
  console.error("playwright-core is missing: run `npm ci` in scraper/ first");
  process.exit(1);
}

const pool = createPool(process.env.DATABASE_URL, { max: 1 });
const { rows } = await pool.query(`
  SELECT w.id AS watch_id, w.entity_type, w.entity_id, w.legacy_item_id, w.title,
         w.sold_price_usd, w.sold_on, w.last_checked_at,
         ph.id AS history_id, ph.source_url, ph.price_usd, ph.sale_date,
         ph.condition, ph.extracted_at
  FROM ebay_listing_watch w
  LEFT JOIN price_history ph
    ON ph.entity_type = w.entity_type AND ph.entity_id = w.entity_id
   AND ph.source_url = 'https://www.ebay.com/itm/' || w.legacy_item_id
  WHERE w.resolution = 'sold'
  ORDER BY w.id`);
console.log(`${rows.length} recorded sales to check`);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: "en-US" })).newPage();

// eBay answers the first request of a session with no cookies with a 403,
// whichever page it is. One visit to the home page gets the session going.
async function warm() {
  await page
    .goto("https://www.ebay.com/", { waitUntil: "domcontentloaded", timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(2_000);
}

async function readOutcome(itemId) {
  let status = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await page
      .goto(`https://www.ebay.com/itm/${itemId}`, { waitUntil: "domcontentloaded", timeout: 45_000 })
      .catch(() => null);
    await page.waitForTimeout(1_500);
    status = res?.status() ?? null;
    const outcome = readListingOutcome(await page.innerText("body").catch(() => ""));
    if (outcome || status !== 403) return { outcome, status };
    await warm();
  }
  return { outcome: null, status };
}

await warm();
const verdicts = { sold: [], seller_ended: [], unread: [] };
for (const row of rows) {
  const { outcome, status } = await readOutcome(row.legacy_item_id);
  verdicts[outcome ?? "unread"].push(row);
  console.log(
    `  ${row.legacy_item_id} ${row.entity_type} ${row.entity_id} $${row.sold_price_usd} ` +
      (outcome ?? `unread (status ${status})`),
  );
}
await browser.close();
console.log(
  `\nsold ${verdicts.sold.length}, seller-ended ${verdicts.seller_ended.length}, ` +
    `unread ${verdicts.unread.length}`,
);

if (!apply) {
  console.log("Dry run. --apply retracts the seller-ended ones.");
  await pool.end();
  process.exit(0);
}

const touched = { lens: new Set(), camera: new Set() };
for (const row of verdicts.seller_ended) {
  appendFileSync(backupPath, JSON.stringify(row) + "\n");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (row.history_id != null) {
      const del = await client.query(
        "DELETE FROM price_history WHERE id = $1 AND source_url = $2",
        [row.history_id, row.source_url],
      );
      if (del.rowCount !== 1) {
        throw new Error(`price_history ${row.history_id}: deleted ${del.rowCount} rows, expected 1`);
      }
    }
    const upd = await client.query(
      `UPDATE ebay_listing_watch
          SET resolution = 'seller_ended', sold_price_usd = NULL, sold_on = NULL
        WHERE id = $1 AND resolution = 'sold'`,
      [row.watch_id],
    );
    if (upd.rowCount !== 1) {
      throw new Error(`watch ${row.watch_id}: updated ${upd.rowCount} rows, expected 1`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  touched[row.entity_type].add(row.entity_id);
}
console.log(`retracted ${verdicts.seller_ended.length}; before-values in ${backupPath}`);
await pool.end();

for (const [entityType, ids] of Object.entries(touched)) {
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const res = await fetch(
      `${siteUrl}/api/cron/recompute-prices?entityType=${entityType}&ids=${chunk.join(",")}`,
      { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } },
    );
    const body = await res.text();
    if (!res.ok) throw new Error(`recompute ${entityType} failed ${res.status}: ${body.slice(0, 200)}`);
    console.log(`recomputed ${chunk.length} ${entityType} estimates`);
  }
}
