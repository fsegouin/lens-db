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
 * the Browse allowance at its reserve, most of a batch was blocked, or Chrome
 * itself has gone. Exits non-zero when more than half of all page loads were
 * blocked, so being shut out does not look like a quiet day.
 *
 * Pages are read by several independent browser sessions at once
 * (lib/ebay-reader.mjs), so a slow listing delays only its own reader. A
 * session whose page crashes or closes is rebuilt for the next listing and
 * the one it was on is reported as null.
 *
 * When Chrome itself dies the pass relaunches it with half as many readers
 * and carries on, down to one. The first two runs with four readers lost the
 * whole browser process about 25 seconds into the first batch (2026-09-13),
 * on a runner and never on a Mac, while one reader had read 800 pages the
 * day before. Halving finds the concurrency the runner tolerates without a
 * diagnosis, and the log says which it settled on. Listings a dying browser
 * left unread are not posted, so the route hands them out again next time.
 * After MAX_RELAUNCHES deaths the pass stops rather than loop.
 *
 * Env: API_URL, CRON_SECRET, RESOLVE_BUDGET (pages, default 800),
 * RESOLVE_BATCH (default 50), RESOLVE_CONCURRENCY (readers, default 4).
 */

import { chromium } from "playwright-core";
import { createReader } from "./lib/ebay-reader.mjs";

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

const MAX_RELAUNCHES = 3;

let browser;
let readers = [];
// Set when Chrome itself goes away; readers then stop rebuilding sessions.
let browserGone = false;
let closingBrowser = false;

/** Launch Chrome and open `count` warmed readers on it. */
async function launch(count) {
  // Chrome logs a failed assertion to a file in its profile directory unless
  // told to use stderr, and the profile is gone with the process. The
  // workflow sets DEBUG=pw:browser so Playwright relays stderr into the log.
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    // No audio output at all: see the note on media in lib/ebay-reader.mjs.
    args: ["--enable-logging=stderr", "--v=0", "--disable-audio-output"],
  });
  browserGone = false;
  closingBrowser = false;
  const thisBrowser = browser;
  browser.on("disconnected", () => {
    if (browser !== thisBrowser) return;
    browserGone = true;
    if (!closingBrowser) console.error("browser disconnected: Chrome exited or crashed");
  });
  readers = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      createReader(browser, `reader ${i + 1}`, { browserGone: isBrowserGone }),
    ),
  );
  await Promise.all(readers.map((reader) => reader.warm()));
}

function isBrowserGone() {
  return browserGone || !browser.isConnected();
}

/**
 * Whether Chrome is gone, giving Playwright a moment to notice. A dying
 * browser fails the calls made on it before its disconnect is reported, so
 * a reader that could not rebuild its session may be reporting a death the
 * flag above has not caught up with yet.
 */
async function browserGoneSoon(ms = 3_000) {
  const until = Date.now() + ms;
  while (!isBrowserGone() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return isBrowserGone();
}

/**
 * launch(), except that Chrome dying during the warm-up is reported and left
 * for the loop below to relaunch, the same as dying mid-batch.
 */
async function launchOrNote(count) {
  try {
    await launch(count);
  } catch (err) {
    if (!(await browserGoneSoon())) throw err;
    console.error(`  Chrome died during warm-up (${err.message.split("\n")[0]})`);
  }
}

async function closeBrowser() {
  closingBrowser = true;
  await browser?.close().catch(() => {});
}

/**
 * Read a batch of listings across every reader at once, keeping the results
 * in the order the queue gave them. Readers pull from a shared cursor, so a
 * listing whose page is slow to settle delays only its own reader. When
 * Chrome dies partway, each reader stops at the listing it was on and the
 * batch comes back short: only listings actually read are in it.
 */
async function readBatch(listings) {
  const results = new Array(listings.length);
  let next = 0;
  await Promise.all(
    readers.map(async (reader) => {
      for (let i = next++; i < listings.length; i = next++) {
        try {
          results[i] = {
            id: listings[i].id,
            page: await reader.readPage(listings[i].legacyItemId),
          };
        } catch (err) {
          if (await browserGoneSoon()) return;
          throw err;
        }
      }
    }),
  );
  return results.filter(Boolean);
}

const totals = {
  sold: 0, sellerEnded: 0, expired: 0, ambiguous: 0, gone: 0,
  active: 0, blocked: 0, deferred: 0, failed: 0, browseCalls: 0,
};
let spent = 0;
let concurrency = CONCURRENCY;
let relaunches = 0;

console.log(`resolve (page budget ${BUDGET}, ${concurrency} readers)`);
try {
  // Inside the try so the finally below closes the browser when a context
  // fails to open or eBay refuses the warm-up, which would otherwise leave a
  // Chrome running for the life of the job.
  await launchOrNote(concurrency);

  while (spent < BUDGET) {
    if (isBrowserGone()) {
      if (relaunches >= MAX_RELAUNCHES) {
        console.log(`  Chrome died ${relaunches + 1} times; stopping`);
        break;
      }
      relaunches++;
      concurrency = Math.max(1, Math.floor(concurrency / 2));
      console.log(`  Chrome died; relaunching with ${concurrency} reader(s) (relaunch ${relaunches} of ${MAX_RELAUNCHES})`);
      await closeBrowser();
      await launchOrNote(concurrency);
      continue;
    }

    const queue = await api(`/api/cron/ebay-resolve?limit=${Math.min(BATCH, BUDGET - spent)}`);
    if (queue.quotaExhausted) {
      console.log(`  daily Browse allowance is down to its reserve (${queue.quotaRemaining}); stopping`);
      break;
    }
    if (queue.listings.length === 0) {
      console.log("  queue drained");
      break;
    }

    const results = await readBatch(queue.listings);
    if (results.length === 0) continue;
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
  await closeBrowser();
}

console.log(
  `\ntotals ${JSON.stringify(totals)} over ${spent} pages` +
    (relaunches ? `, Chrome relaunched ${relaunches} time(s), ended with ${concurrency} reader(s)` : ""),
);
if (spent > 0 && totals.blocked * 2 > spent) {
  console.error("More than half the listing pages were blocked: eBay is refusing this runner");
  process.exit(1);
}
