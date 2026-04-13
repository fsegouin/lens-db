import { chromium } from "playwright-core";
import { buildEbaySearchQuery } from "@/lib/ebay-search-query";

export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  date: string; // YYYY-MM-DD
  condition: string;
  url: string;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/**
 * Fetch sold/completed eBay listings for a batch of cameras using Playwright.
 * Reuses a single browser instance across all cameras.
 */
export async function searchSoldListingsBatch(
  cameras: { id: number; name: string }[],
  onResult: (camera: { id: number; name: string }, listings: EbayListing[]) => Promise<void>,
  delayMs: number = 2000,
): Promise<void> {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });

    const page = await context.newPage();

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];

      if (i > 0 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const listings = await searchSoldListings(page, camera.name);
        await onResult(camera, listings);
      } catch (error) {
        console.error(`[ebay-prices] Error scraping ${camera.name}:`, error);
        await onResult(camera, []);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

/**
 * Fetch sold listings for a single camera using an existing Playwright page.
 */
async function searchSoldListings(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  cameraName: string,
): Promise<EbayListing[]> {
  const query = buildEbaySearchQuery(cameraName);
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "625",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
    _ipg: "60",
  });

  const url = `https://www.ebay.com/sch/i.html?${params}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

  // Extract listings from the rendered DOM
  const listings = await page.evaluate((months: Record<string, string>) => {
    const cards = document.querySelectorAll(".su-card-container");
    const results: {
      itemId: string;
      title: string;
      price: number;
      currency: string;
      date: string;
      condition: string;
      url: string;
    }[] = [];

    for (const card of cards) {
      // Skip promo cards
      const titleEl = card.querySelector(".s-card__title .su-styled-text");
      if (!titleEl || titleEl.textContent?.includes("Shop on eBay")) continue;

      // Sold date
      const captionEl = card.querySelector(".s-card__caption .su-styled-text");
      const soldText = captionEl?.textContent?.trim() ?? "";
      const soldMatch = soldText.match(/Sold\s+(\w+)\s+(\d+),\s+(\d+)/);
      if (!soldMatch) continue;

      const month = months[soldMatch[1]] ?? "01";
      const day = soldMatch[2].padStart(2, "0");
      const year = soldMatch[3];
      const date = `${year}-${month}-${day}`;

      // Title
      const title = (titleEl.textContent ?? "")
        .replace("Opens in a new window or tab", "")
        .trim()
        .slice(0, 120);
      if (!title) continue;

      // Price
      const priceEl = card.querySelector(
        ".su-card-container__attributes__primary .s-card__attribute-row:first-child .su-styled-text",
      );
      const priceText = priceEl?.textContent?.trim() ?? "";
      const priceMatch = priceText.match(/([\d,]+\.\d{2})/);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(",", ""));
      if (price <= 0) continue;

      // Condition
      const condEl = card.querySelector(".s-card__subtitle .su-styled-text");
      const condition = condEl?.textContent?.trim() ?? "";

      // Item ID
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

    return results.slice(0, 50);
  }, MONTHS);

  return listings;
}
