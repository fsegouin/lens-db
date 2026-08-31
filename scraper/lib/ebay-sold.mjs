/**
 * Shared eBay sold-listings scraping logic.
 *
 * Used by ebay-scrape-action.mjs (cameras), ebay-lens-scrape-action.mjs
 * (lenses), and ebay-sandbox.mjs (local parser sandbox). Any change to the
 * request fingerprint or parsing must happen here so all three stay identical.
 *
 * eBay requires a signed-in session to view sold/completed listings
 * (since ~2026-07-24 signed-out searches with LH_Sold=1 redirect to
 * signin.ebay.com). Callers pass a Playwright storageState captured via
 * `node scraper/ebay-sandbox.mjs login`.
 */

export const EBAY_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Same fingerprint for CI runs and local session capture — a session captured
// under a different UA may be invalidated by eBay when replayed in CI.
export const CONTEXT_OPTIONS = {
  userAgent: EBAY_UA,
  viewport: { width: 1280, height: 800 },
  locale: "en-US",
};

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripParens(name) {
  return name.replace(/\s*\([^)]*\)/g, "").trim();
}

export function buildSoldSearchUrl(query) {
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "625",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
    _ipg: "60",
  });
  return `https://www.ebay.com/sch/i.html?${params}`;
}

export function loadStorageStateFromEnv() {
  const raw = process.env.EBAY_STORAGE_STATE;
  if (!raw) {
    console.warn(
      "Warning: EBAY_STORAGE_STATE not set — sold-listing searches will hit the sign-in wall"
    );
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `EBAY_STORAGE_STATE is set but not valid JSON (${error.message}). ` +
        "Re-capture it with: node scraper/ebay-sandbox.mjs login"
    );
  }
}

export function createEbayContext(browser, { storageState } = {}) {
  return browser.newContext({
    ...CONTEXT_OPTIONS,
    ...(storageState ? { storageState } : {}),
  });
}

function isBlockedUrl(url) {
  return (
    url.includes("signin.ebay.com") ||
    url.includes("sgfl=srch") ||
    url.includes("splashui/challenge")
  );
}

/**
 * Scrape sold listings for a prepared query string.
 *
 * Returns { status, listings, finalUrl, httpStatus, cardCount } where status:
 *  - "ok":            results page rendered, listings parsed (may be empty)
 *  - "blocked":       redirected to sign-in / captcha — session missing or dead
 *  - "no_results":    confirmed results page with zero sold listings
 *  - "unknown_empty": page rendered but unrecognized (layout change / soft block)
 */
export async function scrapeSoldListings(page, query) {
  const url = buildSoldSearchUrl(query);
  const response = await page.goto(url, { waitUntil: "load", timeout: 20000 });
  const httpStatus = response?.status() ?? 0;

  const result = (status, extra = {}) => ({
    status,
    listings: [],
    finalUrl: page.url(),
    httpStatus,
    cardCount: 0,
    ...extra,
  });

  if (isBlockedUrl(page.url())) return result("blocked");

  try {
    await page.waitForSelector(".s-card__title", { timeout: 8000 });
  } catch {
    // Selector never appeared — figure out why before giving up
    if (isBlockedUrl(page.url())) return result("blocked");

    const onSearchPage = page.url().startsWith("https://www.ebay.com/sch/");
    const hasResultsChrome = await page
      .evaluate(
        () =>
          !!document.querySelector(
            '.srp-controls, .srp-river, .srp-save-null-search, [class*="srp-"]'
          )
      )
      .catch(() => false);
    if (onSearchPage && hasResultsChrome) return result("no_results");
    return result("unknown_empty");
  }

  const { cardCount, listings } = await page.evaluate((months) => {
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
      const price = parseFloat(priceMatch[1].replace(/,/g, ""));
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

    return { cardCount: cards.length, listings: results.slice(0, 20) };
  }, MONTHS);

  return result("ok", { cardCount, listings });
}

export function logScrapeResult(label, r) {
  let where = r.finalUrl;
  try {
    const u = new URL(r.finalUrl);
    where = u.host + u.pathname;
  } catch {
    // keep raw URL
  }
  console.log(
    `${label}: ${r.listings.length} listings ` +
      `[${r.status}, http ${r.httpStatus}, cards ${r.cardCount}, ${where}]`
  );
}
