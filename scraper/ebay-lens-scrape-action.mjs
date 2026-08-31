/**
 * eBay Price Scraper for Lenses — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-lens-prices → get batch of lenses needing price updates
 * 2. For each lens: scrape eBay sold listings with Playwright (signed-in via
 *    EBAY_STORAGE_STATE — sold listings are behind a login wall)
 * 3. POST /api/cron/ebay-lens-prices → send listings for LLM classification + storage
 *
 * Exit codes: 1 fatal error, 2 eBay sign-in wall (session missing/expired),
 * 3 too many consecutive unrecognized empty pages (layout change / soft block).
 */

import { chromium } from "playwright-core";
import {
  createEbayContext,
  delay,
  loadStorageStateFromEnv,
  logScrapeResult,
  scrapeSoldListings,
  stripParens,
} from "./lib/ebay-sold.mjs";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const DELAY_BETWEEN_LENSES_MS = 2000;
const MAX_CONSECUTIVE_UNKNOWN = 5;
const PREFLIGHT_QUERY = "canon 50mm 1.8";

const BLOCKED_HELP =
  "eBay sign-in wall detected — EBAY_STORAGE_STATE is missing, expired, or invalidated. " +
  "Re-capture it with: node scraper/ebay-sandbox.mjs login";

async function getLensBatchState(staleBefore) {
  const headers = {};
  if (CRON_SECRET) headers["Authorization"] = `Bearer ${CRON_SECRET}`;

  const url = new URL(`${API_URL}/api/cron/ebay-lens-prices`);
  if (staleBefore) {
    url.searchParams.set("staleBefore", staleBefore);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to get lens batch: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitListings(lensId, lensName, listings) {
  const res = await fetch(`${API_URL}/api/cron/ebay-lens-prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify({ lensId, lensName, listings }),
  });
  if (!res.ok) {
    console.error(`  Failed to submit: ${res.status}`);
    return { relevant: 0, stored: 0 };
  }
  return res.json();
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }
  const storageState = loadStorageStateFromEnv();

  const rotationStartedAt = new Date().toISOString();
  console.log(`Fetching lens batch from ${API_URL}...`);
  const batchState = await getLensBatchState();
  const lenses = batchState.lenses;
  console.log(`Got ${lenses.length} lenses to process\n`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await createEbayContext(browser, { storageState });
  const page = await context.newPage();

  // Preflight: verify the session works before touching the batch, so a dead
  // session fails the job loudly with zero lenses falsely marked as scraped.
  const preflight = await scrapeSoldListings(page, PREFLIGHT_QUERY);
  logScrapeResult(`Preflight "${PREFLIGHT_QUERY}"`, preflight);
  if (preflight.status === "blocked") {
    console.error(BLOCKED_HELP);
    await browser.close();
    process.exit(2);
  }

  let totalStored = 0;
  let consecutiveUnknown = 0;
  const statusCounts = {};

  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    if (i > 0) await delay(DELAY_BETWEEN_LENSES_MS);

    let result = null;
    try {
      result = await scrapeSoldListings(page, stripParens(lens.name));
    } catch (error) {
      console.error(`${i + 1}/${lenses.length} ${lens.name}: Error scraping: ${error.message}`);
    }

    const status = result?.status ?? "error";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (result) {
      logScrapeResult(`${i + 1}/${lenses.length} ${lens.name}`, result);
    }

    if (status === "blocked") {
      console.error(BLOCKED_HELP);
      await browser.close();
      process.exit(2);
    }

    if (status === "ok" || status === "no_results") {
      consecutiveUnknown = 0;
      const listings = result.listings;
      // Submit even with 0 listings on a confirmed results page, so the lens is
      // marked as scraped and rotated out of the priority queue
      try {
        const submitResult = await submitListings(lens.id, lens.name, listings);
        if (listings.length > 0) {
          console.log(`  Relevant: ${submitResult.relevant}, Stored: ${submitResult.stored}`);
        }
        totalStored += submitResult.stored || 0;
      } catch (error) {
        console.error(`  Error submitting: ${error.message}`);
      }
    } else {
      // unknown_empty or thrown error: do NOT submit — marking the lens as
      // scraped with no data would silently poison the rotation queue
      consecutiveUnknown++;
      if (consecutiveUnknown >= MAX_CONSECUTIVE_UNKNOWN) {
        console.error(
          `Aborting: ${MAX_CONSECUTIVE_UNKNOWN} consecutive lenses with unrecognized ` +
            "empty pages (eBay layout change or soft block)"
        );
        await browser.close();
        process.exit(3);
      }
    }
  }

  await browser.close();
  console.log(
    `\nDone: ${lenses.length} lenses, ${totalStored} stored ` +
      `(${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
  );

  try {
    const finalState = await getLensBatchState(rotationStartedAt);
    const stats = finalState.stats;
    if (stats?.outdatedLenses !== undefined) {
      console.log(
        `Rotation remaining: ${stats.outdatedLenses} lenses with outdated data ` +
        `(~${stats.estimatedRunsRemaining} runs left at ${stats.batchSize}/run)`
      );
    }
  } catch (error) {
    console.warn(`Could not fetch rotation stats: ${error.message}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
