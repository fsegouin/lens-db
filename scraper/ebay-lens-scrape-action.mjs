/**
 * eBay Price Scraper for Lenses — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-lens-prices → get batch of lenses needing price updates
 * 2. For each lens: scrape eBay sold listings with Playwright
 * 3. POST /api/cron/ebay-lens-prices → send listings for LLM classification + storage
 */

import { chromium } from "playwright-core";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const DELAY_BETWEEN_LENSES_MS = 2000;

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchQuery(lensName) {
  // Strip parenthesized content
  const name = lensName.replace(/\s*\([^)]*\)/g, "").trim();
  return name;
}

async function getLensBatch() {
  return getLensBatchState();
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

async function scrapeSoldListings(page, lensName) {
  const query = buildSearchQuery(lensName);
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "625",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
    _ipg: "60",
  });

  const url = `https://www.ebay.com/sch/i.html?${params}`;

  await page.goto(url, { waitUntil: "load", timeout: 20000 });

  // Wait for listing cards to render
  try {
    await page.waitForSelector(".s-card__title", { timeout: 8000 });
  } catch {
    return [];
  }

  return page.evaluate((months) => {
    const cards = document.querySelectorAll(".su-card-container");
    const results = [];

    for (const card of cards) {
      const titleEl = card.querySelector(".s-card__title .su-styled-text");
      if (!titleEl || titleEl.textContent?.includes("Shop on eBay")) continue;

      const captionEl = card.querySelector(".s-card__caption .su-styled-text");
      const soldText = captionEl?.textContent?.trim() ?? "";
      const soldMatch = soldText.match(/Sold\s+(\w+)\s+(\d+),\s+(\d+)/);
      if (!soldMatch) continue;

      const month = months[soldMatch[1]] ?? "01";
      const day = soldMatch[2].padStart(2, "0");
      const year = soldMatch[3];
      const date = `${year}-${month}-${day}`;

      const title = (titleEl.textContent ?? "")
        .replace("Opens in a new window or tab", "")
        .trim()
        .slice(0, 120);
      if (!title) continue;

      const priceEl = card.querySelector(
        ".su-card-container__attributes__primary .s-card__attribute-row:first-child .su-styled-text"
      );
      const priceText = priceEl?.textContent?.trim() ?? "";
      const priceMatch = priceText.match(/([\d,]+\.\d{2})/);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(",", ""));
      if (price <= 0) continue;

      const condEl = card.querySelector(".s-card__subtitle .su-styled-text");
      const condition = condEl?.textContent?.trim() ?? "";

      const linkEl = card.querySelector("a.s-card__link");
      const href = linkEl?.getAttribute("href") ?? "";
      const itemIdMatch = href.match(/\/itm\/(\d+)/);
      if (!itemIdMatch) continue;

      results.push({
        itemId: itemIdMatch[1],
        title,
        price,
        currency: "USD",
        date,
        condition,
        url: `https://www.ebay.com/itm/${itemIdMatch[1]}`,
      });
    }

    return results.slice(0, 20);
  }, MONTHS);
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }

  const rotationStartedAt = new Date().toISOString();
  console.log(`Fetching lens batch from ${API_URL}...`);
  const batchState = await getLensBatch();
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

  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    if (i > 0) await delay(DELAY_BETWEEN_LENSES_MS);

    let listings = [];
    try {
      listings = await scrapeSoldListings(page, lens.name);
    } catch (error) {
      console.error(`  Error scraping: ${error.message}`);
    }

    console.log(`${i + 1}/${lenses.length} ${lens.name}: ${listings.length} listings`);

    // Always submit to API — even with 0 listings, so the lens is marked as scraped
    // and gets rotated out of the "never-scraped" priority queue
    try {
      const result = await submitListings(lens.id, lens.name, listings);
      if (listings.length > 0) {
        console.log(`  Relevant: ${result.relevant}, Stored: ${result.stored}`);
      }
      totalStored += result.stored || 0;
    } catch (error) {
      console.error(`  Error submitting: ${error.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone: ${lenses.length} lenses, ${totalStored} stored`);

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
