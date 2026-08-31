/**
 * eBay Price Scraper — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-prices → get batch of cameras needing price updates
 * 2. For each camera: scrape eBay sold listings with Playwright (signed-in via
 *    EBAY_STORAGE_STATE — sold listings are behind a login wall)
 * 3. POST /api/cron/ebay-prices → send listings for LLM classification + storage
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
const DELAY_BETWEEN_CAMERAS_MS = 2000;
const MAX_CONSECUTIVE_UNKNOWN = 5;
const PREFLIGHT_QUERY = "canon ae-1";

const BLOCKED_HELP =
  "eBay sign-in wall detected — EBAY_STORAGE_STATE is missing, expired, or invalidated. " +
  "Re-capture it with: node scraper/ebay-sandbox.mjs login";

function buildSearchQuery(cameraName) {
  let name = cameraName;
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  return stripParens(name);
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

async function submitListings(cameraId, cameraName, listings) {
  const res = await fetch(`${API_URL}/api/cron/ebay-prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify({ cameraId, cameraName, listings }),
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
  console.log(`Fetching camera batch from ${API_URL}...`);
  const batchState = await getCameraBatchState();
  const cameras = batchState.cameras;
  console.log(`Got ${cameras.length} cameras to process\n`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await createEbayContext(browser, { storageState });
  const page = await context.newPage();

  // Preflight: verify the session works before touching the batch, so a dead
  // session fails the job loudly with zero cameras falsely marked as scraped.
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

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i];
    if (i > 0) await delay(DELAY_BETWEEN_CAMERAS_MS);

    let result = null;
    try {
      result = await scrapeSoldListings(page, buildSearchQuery(camera.name));

      // If alias exists and few results, also search alias (only when the
      // primary search reached a real results page)
      if (
        camera.alias &&
        result.listings.length < 5 &&
        (result.status === "ok" || result.status === "no_results")
      ) {
        await delay(DELAY_BETWEEN_CAMERAS_MS);
        const aliasResult = await scrapeSoldListings(page, buildSearchQuery(camera.alias));
        if (aliasResult.status === "blocked") {
          result = aliasResult;
        } else if (aliasResult.status === "ok") {
          const listings = [...result.listings];
          const seen = new Set(listings.map((l) => l.itemId));
          for (const l of aliasResult.listings) {
            if (!seen.has(l.itemId)) listings.push(l);
          }
          result = { ...result, listings: listings.slice(0, 20) };
        }
      }
    } catch (error) {
      console.error(`${i + 1}/${cameras.length} ${camera.name}: Error scraping: ${error.message}`);
    }

    const status = result?.status ?? "error";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (result) {
      logScrapeResult(`${i + 1}/${cameras.length} ${camera.name}`, result);
    }

    if (status === "blocked") {
      console.error(BLOCKED_HELP);
      await browser.close();
      process.exit(2);
    }

    if (status === "ok" || status === "no_results") {
      consecutiveUnknown = 0;
      const listings = result.listings;
      // Submit even with 0 listings on a confirmed results page, so the camera
      // is marked as scraped and rotated out of the priority queue
      try {
        const submitResult = await submitListings(camera.id, camera.name, listings);
        if (listings.length > 0) {
          console.log(`  Relevant: ${submitResult.relevant}, Stored: ${submitResult.stored}`);
        }
        totalStored += submitResult.stored || 0;
      } catch (error) {
        console.error(`  Error submitting: ${error.message}`);
      }
    } else {
      // unknown_empty or thrown error: do NOT submit — marking the camera as
      // scraped with no data would silently poison the rotation queue
      consecutiveUnknown++;
      if (consecutiveUnknown >= MAX_CONSECUTIVE_UNKNOWN) {
        console.error(
          `Aborting: ${MAX_CONSECUTIVE_UNKNOWN} consecutive cameras with unrecognized ` +
            "empty pages (eBay layout change or soft block)"
        );
        await browser.close();
        process.exit(3);
      }
    }
  }

  await browser.close();
  console.log(
    `\nDone: ${cameras.length} cameras, ${totalStored} stored ` +
      `(${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
  );

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
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
