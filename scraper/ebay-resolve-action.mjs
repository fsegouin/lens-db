/**
 * The resolve pass of the eBay price pipeline: read each due listing's own
 * page and hand the route what it says.
 *
 * The Browse API reports a listing its seller pulled in the same shape as a
 * sale, so a sale recorded on its word alone is wrong about one time in three.
 * The listing page says which in so many words, and it loads from a GitHub
 * runner (tested 2026-09-12), so the runner reads it and the route decides:
 *
 *   GET  /api/cron/ebay-resolve?limit=N   the listings due a check
 *   POST /api/cron/ebay-resolve           { results: [{ id, page }] }
 *
 * `page` is "sold", "seller_ended", "blocked", or null for a page with no
 * banner. Every listing posted leaves the queue for at least a day whatever
 * its verdict, so a page that keeps failing cannot jam the head of it.
 *
 * Stops when the page budget is spent, the queue is empty, the route reports
 * the Browse allowance at its reserve, or most of a batch was blocked. Exits
 * non-zero when more than half of all page loads were blocked, so being shut
 * out does not look like a quiet day.
 *
 * Pages are read by several independent browser sessions at once, so a slow
 * listing delays only its own reader.
 *
 * Env: API_URL, CRON_SECRET, RESOLVE_BUDGET (pages, default 800),
 * RESOLVE_BATCH (default 50), RESOLVE_CONCURRENCY (readers, default 4).
 */

import { chromium } from "playwright-core";
import { readListingPage } from "../frontend/scripts/lib/ebay-listing-page.mjs";

const { API_URL, CRON_SECRET } = process.env;
const BUDGET = Number(process.env.RESOLVE_BUDGET || 800);
const BATCH = Number(process.env.RESOLVE_BATCH || 50);
// Pages read at once, each in its own browser session. Four keeps the runner
// busy without turning the pass into a burst eBay would read as a scraper;
// the blocked-page guard below is what says whether it has gone too far.
const CONCURRENCY = Math.max(1, Number(process.env.RESOLVE_CONCURRENCY) || 4);
if (!API_URL || !CRON_SECRET) {
  console.error("API_URL and CRON_SECRET are required");
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CRON_SECRET}`, ...init.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

/**
 * One independent reader: its own context, so its own cookie jar and its own
 * eBay session. Sharing a single tab meant every page load waited for the one
 * before it, and at ~3s a page a budget of 800 held the runner for most of an
 * hour. Separate contexts rather than separate tabs on one, so a session eBay
 * decides to block takes only its own reader down with it.
 */
async function createReader() {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  async function load(url) {
    const res = await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })
      .catch(() => null);
    await page.waitForTimeout(1_500);
    return {
      status: res?.status() ?? null,
      title: await page.title().catch(() => ""),
      text: await page.innerText("body").catch(() => ""),
    };
  }

  // eBay answers the first request of a session with no cookies with a 403,
  // whichever page it is. One visit to the home page gets the session going.
  async function warm() {
    await load("https://www.ebay.com/");
  }

  async function readPage(itemId) {
    let verdict = "blocked";
    for (let attempt = 0; attempt < 2 && verdict === "blocked"; attempt++) {
      if (attempt > 0) await warm();
      verdict = readListingPage(await load(`https://www.ebay.com/itm/${itemId}`));
    }
    return verdict;
  }

  return { warm, readPage };
}

/**
 * Read a batch of listings across every reader at once, keeping the results
 * in the order the queue gave them. Readers pull from a shared cursor, so a
 * listing whose page is slow to settle delays only its own reader.
 */
async function readBatch(readers, listings) {
  const results = new Array(listings.length);
  let next = 0;
  await Promise.all(
    readers.map(async (reader) => {
      for (let i = next++; i < listings.length; i = next++) {
        results[i] = {
          id: listings[i].id,
          page: await reader.readPage(listings[i].legacyItemId),
        };
      }
    }),
  );
  return results;
}

const totals = {
  sold: 0, sellerEnded: 0, expired: 0, ambiguous: 0, gone: 0,
  active: 0, blocked: 0, deferred: 0, failed: 0, browseCalls: 0,
};
let spent = 0;

console.log(`resolve (page budget ${BUDGET}, ${CONCURRENCY} readers)`);
try {
  // Inside the try so the finally below closes the browser when a context
  // fails to open or eBay refuses the warm-up. Launched above, these would
  // leave a Chromium running for the life of the job.
  const readers = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => createReader()),
  );
  await Promise.all(readers.map((reader) => reader.warm()));

  while (spent < BUDGET) {
    const queue = await api(`/api/cron/ebay-resolve?limit=${Math.min(BATCH, BUDGET - spent)}`);
    if (queue.quotaExhausted) {
      console.log(`  daily Browse allowance is down to its reserve (${queue.quotaRemaining}); stopping`);
      break;
    }
    if (queue.listings.length === 0) {
      console.log("  queue drained");
      break;
    }

    const results = await readBatch(readers, queue.listings);
    spent += results.length;
    const batchBlocked = results.filter((r) => r.page === "blocked").length;

    const r = await api("/api/cron/ebay-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    for (const key of Object.keys(totals)) totals[key] += r[key] ?? 0;
    console.log(
      `  read ${results.length}: sold ${r.sold}, seller-ended ${r.sellerEnded}, ` +
        `expired ${r.expired}, ambiguous ${r.ambiguous}, live ${r.active}, ` +
        `blocked ${r.blocked}, deferred ${r.deferred} ` +
        `(pages ${spent}, browse ${r.browseCalls}, ${r.queuedDisappeared} disappeared queued, ` +
        `quota ${r.quotaRemaining ?? "?"})`,
    );

    if (r.quotaExhausted) {
      console.log("  daily Browse allowance is down to its reserve; stopping");
      break;
    }
    if (r.rateLimited) {
      console.log("  eBay refused further Browse calls; stopping");
      break;
    }
    if (batchBlocked * 2 > results.length) {
      console.log(`  ${batchBlocked} of ${results.length} pages were blocked; stopping`);
      break;
    }
  }
} finally {
  await browser.close();
}

console.log(`\ntotals ${JSON.stringify(totals)} over ${spent} pages`);
if (spent > 0 && totals.blocked * 2 > spent) {
  console.error("More than half the listing pages were blocked: eBay is refusing this runner");
  process.exit(1);
}
