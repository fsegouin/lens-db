/**
 * eBay Price Scraper for Lenses — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-lens-prices → get batch of lenses needing price updates
 * 2. For each lens: scrape eBay sold listings with Playwright
 * 3. POST /api/cron/ebay-lens-prices → send listings for LLM classification + storage
 *
 * A lens eBay refused to show us is skipped, not submitted: see
 * ebay-sold-scrape.mjs for why an unread page must never be stored.
 */

import { chromium } from "playwright-core";
import { scrapeSoldListings, OUTCOME } from "./ebay-sold-scrape.mjs";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const DELAY_BETWEEN_LENSES_MS = 2000;

// Consecutive blocks that mean eBay has stopped serving this run entirely.
// Grinding through the remaining lenses would just log 400 failures and
// burn 70 minutes of Actions time, so stop and report instead.
const CONSECUTIVE_BLOCK_ABORT = 10;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchQuery(lensName) {
  // Strip parenthesized content
  return lensName.replace(/\s*\([^)]*\)/g, "").trim();
}

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

async function submitListings(lensId, lensName, listings, outcome) {
  const res = await fetch(`${API_URL}/api/cron/ebay-lens-prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify({ lensId, lensName, listings, outcome }),
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

  const rotationStartedAt = new Date().toISOString();
  console.log(`Fetching lens batch from ${API_URL}...`);
  const batchState = await getLensBatchState();
  const lenses = batchState.lenses;
  console.log(`Got ${lenses.length} lenses to process\n`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  let totalStored = 0;
  let attempted = 0;
  let blockedCount = 0;
  let consecutiveBlocks = 0;
  let aborted = false;
  const blockReasons = new Map();

  try {
    for (let i = 0; i < lenses.length; i++) {
      const lens = lenses[i];
      if (i > 0) await delay(DELAY_BETWEEN_LENSES_MS);

      attempted++;
      const result = await scrapeSoldListings(page, buildSearchQuery(lens.name));

      if (result.outcome === OUTCOME.BLOCKED) {
        blockedCount++;
        consecutiveBlocks++;
        blockReasons.set(result.reason, (blockReasons.get(result.reason) ?? 0) + 1);
        console.warn(
          `${i + 1}/${lenses.length} ${lens.name}: BLOCKED (${result.reason}) — ` +
          `not submitted, stays in the queue`,
        );
        if (consecutiveBlocks >= CONSECUTIVE_BLOCK_ABORT) {
          console.error(
            `\nAborting: ${consecutiveBlocks} consecutive blocks. ` +
            `eBay is not serving this run.`,
          );
          aborted = true;
          break;
        }
        continue;
      }

      consecutiveBlocks = 0;
      const { listings } = result;
      console.log(
        `${i + 1}/${lenses.length} ${lens.name}: ${listings.length} listings` +
        (result.outcome === OUTCOME.EMPTY ? " (no sold items)" : ""),
      );

      // Submit `ok` and `empty` alike: both are real answers about this lens,
      // and `empty` still needs to mark it scraped so it rotates out of the
      // never-scraped priority queue.
      try {
        const submitted = await submitListings(
          lens.id,
          lens.name,
          listings,
          result.outcome,
        );
        if (listings.length > 0) {
          console.log(`  Relevant: ${submitted.relevant}, Stored: ${submitted.stored}`);
        }
        totalStored += submitted.stored || 0;
      } catch (error) {
        console.error(`  Error submitting: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const succeeded = attempted - blockedCount;
  console.log(
    `\nDone: ${succeeded}/${attempted} lenses read, ${blockedCount} blocked, ` +
    `${totalStored} stored`,
  );
  if (blockReasons.size > 0) {
    console.log("Block reasons:");
    for (const [reason, n] of [...blockReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${reason}`);
    }
  }

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

  // Fail the workflow when eBay locked us out. A run that reads nothing used
  // to exit 0 and look identical to a healthy one, which is how this went
  // unnoticed for six weeks.
  if (aborted) {
    throw new Error("Run aborted: eBay blocked consecutive requests");
  }
  if (attempted > 0 && blockedCount / attempted > 0.5) {
    throw new Error(
      `Run degraded: ${blockedCount}/${attempted} requests blocked by eBay`,
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
