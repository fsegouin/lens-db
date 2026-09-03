/**
 * eBay Price Scraper — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-prices → get batch of cameras needing price updates
 * 2. For each camera: scrape eBay sold listings with Playwright
 * 3. POST /api/cron/ebay-prices → send listings for LLM classification + storage
 *
 * A camera eBay refused to show us is skipped, not submitted: see
 * ebay-sold-scrape.mjs for why an unread page must never be stored.
 */

import { chromium } from "playwright-core";
import { scrapeSoldListings, OUTCOME } from "./ebay-sold-scrape.mjs";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const DELAY_BETWEEN_CAMERAS_MS = 2000;

// Consecutive blocks that mean eBay has stopped serving this run entirely.
const CONSECUTIVE_BLOCK_ABORT = 10;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchQuery(cameraName) {
  let name = cameraName;
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  name = name.replace(/\s*\([^)]*\)/g, "").trim();
  return name;
}

async function getCameraBatchState(staleBefore) {
  const headers = {};
  if (CRON_SECRET) headers["Authorization"] = `Bearer ${CRON_SECRET}`;

  const url = new URL(`${API_URL}/api/cron/ebay-prices`);
  if (staleBefore) {
    url.searchParams.set("staleBefore", staleBefore);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to get camera batch: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitListings(cameraId, cameraName, listings, outcome) {
  const res = await fetch(`${API_URL}/api/cron/ebay-prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify({ cameraId, cameraName, listings, outcome }),
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
  console.log(`Fetching camera batch from ${API_URL}...`);
  const batchState = await getCameraBatchState();
  const cameras = batchState.cameras;
  console.log(`Got ${cameras.length} cameras to process\n`);

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
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      if (i > 0) await delay(DELAY_BETWEEN_CAMERAS_MS);

      attempted++;
      const result = await scrapeSoldListings(page, buildSearchQuery(camera.name));

      if (result.outcome === OUTCOME.BLOCKED) {
        blockedCount++;
        consecutiveBlocks++;
        blockReasons.set(result.reason, (blockReasons.get(result.reason) ?? 0) + 1);
        console.warn(
          `${i + 1}/${cameras.length} ${camera.name}: BLOCKED (${result.reason}) — ` +
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
      let listings = result.listings;

      // If an alias exists and the primary name found little, try the alias
      // too. A block on the alias only costs us the extra results — the
      // primary read still stands, so it is not counted as a failure.
      if (camera.alias && listings.length < 5) {
        await delay(DELAY_BETWEEN_CAMERAS_MS);
        const aliasResult = await scrapeSoldListings(
          page,
          buildSearchQuery(camera.alias),
        );
        if (aliasResult.outcome === OUTCOME.OK) {
          const seen = new Set(listings.map((l) => l.itemId));
          for (const l of aliasResult.listings) {
            if (!seen.has(l.itemId)) listings.push(l);
          }
          listings = listings.slice(0, 20);
        }
      }

      console.log(
        `${i + 1}/${cameras.length} ${camera.name}: ${listings.length} listings` +
        (result.outcome === OUTCOME.EMPTY ? " (no sold items)" : ""),
      );

      // Submit `ok` and `empty` alike: both are real answers about this
      // camera, and `empty` still needs to mark it scraped so it rotates out
      // of the never-scraped priority queue.
      try {
        const submitted = await submitListings(
          camera.id,
          camera.name,
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
    `\nDone: ${succeeded}/${attempted} cameras read, ${blockedCount} blocked, ` +
    `${totalStored} stored`,
  );
  if (blockReasons.size > 0) {
    console.log("Block reasons:");
    for (const [reason, n] of [...blockReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${reason}`);
    }
  }

  try {
    const finalState = await getCameraBatchState(rotationStartedAt);
    const stats = finalState.stats;
    if (stats?.outdatedCameras !== undefined) {
      console.log(
        `Rotation remaining: ${stats.outdatedCameras} cameras with outdated data ` +
        `(~${stats.estimatedRunsRemaining} runs left at ${stats.batchSize}/run)`
      );
    }
  } catch (error) {
    console.warn(`Could not fetch rotation stats: ${error.message}`);
  }

  // Fail the workflow when eBay locked us out. A run that reads nothing used
  // to exit 0 and look identical to a healthy one.
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
