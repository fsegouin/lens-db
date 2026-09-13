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
 * the Browse allowance at its reserve, most of a batch was blocked, or every
 * reader has lost its Chrome too often. Exits non-zero when more than half of
 * all page loads were blocked, so being shut out does not look like a quiet
 * day.
 *
 * Pages are read by several readers at once (lib/ebay-reader.mjs), each in
 * its own Chrome process, so a slow listing delays only its own reader. A
 * reader whose page crashes rebuilds its session and reports that listing as
 * null. A reader whose Chrome dies relaunches it and carries on with the
 * next listing, up to MAX_RELAUNCHES times, after which it retires; the
 * listing it was on is not posted, so the route hands it out again.
 *
 * One process per reader because on a GitHub runner Chrome dies with SIGTRAP
 * about 20 s after launch some of the time (2026-09-13: four of six runs
 * with four readers on one shared Chrome, then one process in four when each
 * reader had its own, the other three reading on unharmed). It never did on
 * a Mac, and never after those first seconds. Separate processes make it
 * one reader's problem for one relaunch instead of the whole pass's.
 *
 * Env: API_URL, CRON_SECRET, RESOLVE_BUDGET (pages, default 800),
 * RESOLVE_BATCH (default 50), RESOLVE_CONCURRENCY (readers, default 4).
 */

import { chromium } from "playwright-core";
import { createReader } from "./lib/ebay-reader.mjs";

const { API_URL, CRON_SECRET } = process.env;
const BUDGET = Number(process.env.RESOLVE_BUDGET || 800);
const BATCH = Number(process.env.RESOLVE_BATCH || 50);
// Pages read at once, each in its own Chrome. Four keeps the runner busy
// without turning the pass into a burst eBay would read as a scraper; the
// blocked-page guard below is what says whether it has gone too far.
const CONCURRENCY = Math.max(1, Number(process.env.RESOLVE_CONCURRENCY) || 4);
// Chrome deaths one reader will recover from before it retires.
const MAX_RELAUNCHES = 3;
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

/**
 * One reader on its own Chrome, with what it takes to bring both back.
 * `browser` is the Playwright handle, `reader` the session on it, `gone`
 * set when that Chrome went away, `relaunches` how many times it has.
 */
class ReaderProcess {
  constructor(name) {
    this.name = name;
    this.browser = null;
    this.reader = null;
    this.gone = true;
    this.closing = false;
    this.relaunches = 0;
    this.retired = false;
  }

  isGone() {
    return this.gone || !this.browser?.isConnected();
  }

  /**
   * Whether Chrome is gone, giving Playwright a moment to notice. A dying
   * browser fails the calls made on it before its disconnect is reported,
   * so a reader that could not rebuild its session may be reporting a death
   * the flag has not caught up with yet.
   */
  async goneSoon(ms = 3_000) {
    const until = Date.now() + ms;
    while (!this.isGone() && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.isGone();
  }

  /** Launch Chrome, open the session, warm it. */
  async launch() {
    // Chrome logs a failed assertion to a file in its profile directory
    // unless told to use stderr, and the profile is gone with the process.
    // The workflow sets DEBUG=pw:browser so Playwright relays stderr.
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      // No audio output at all: see the note on media in lib/ebay-reader.mjs.
      args: ["--enable-logging=stderr", "--v=0", "--disable-audio-output"],
    });
    this.browser = browser;
    this.gone = false;
    this.closing = false;
    browser.on("disconnected", () => {
      if (this.browser !== browser) return;
      this.gone = true;
      if (!this.closing) console.error(`${this.name}: Chrome exited or crashed`);
    });
    this.reader = await createReader(browser, this.name, { browserGone: () => this.isGone() });
    await this.reader.warm();
  }

  /**
   * Bring Chrome back after a death, or retire when it has died too often.
   * A death during the warm-up counts like any other and is tried again.
   */
  async relaunch() {
    await this.close();
    while (!this.retired) {
      if (this.relaunches >= MAX_RELAUNCHES) {
        this.retired = true;
        console.error(`${this.name}: Chrome died ${this.relaunches + 1} times; retiring this reader`);
        return;
      }
      this.relaunches++;
      console.log(`  ${this.name}: relaunching Chrome (${this.relaunches} of ${MAX_RELAUNCHES})`);
      try {
        await this.launch();
        return;
      } catch (err) {
        if (!(await this.goneSoon())) throw err;
        console.error(`${this.name}: Chrome died during warm-up (${err.message.split("\n")[0]})`);
        await this.close();
      }
    }
  }

  /**
   * Close Chrome if it is still there. Closing one that was killed can hang
   * in Playwright, and there is nothing to close anyway; a live one that
   * will not go within ten seconds is left to the runner's cleanup.
   */
  async close() {
    this.closing = true;
    if (!this.browser || this.isGone()) return;
    await Promise.race([
      this.browser.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
  }
}

const processes = Array.from({ length: CONCURRENCY }, (_, i) => new ReaderProcess(`reader ${i + 1}`));
const active = () => processes.filter((p) => !p.retired);

/**
 * Read a batch of listings across every reader at once, keeping the results
 * in the order the queue gave them. Readers pull from a shared cursor, so a
 * listing whose page is slow to settle delays only its own reader. A reader
 * whose Chrome dies relaunches it and takes the next listing; the one it was
 * on is left out, so the batch can come back short.
 */
async function readBatch(listings) {
  const results = new Array(listings.length);
  let next = 0;
  await Promise.all(
    active().map(async (proc) => {
      for (let i = next++; i < listings.length && !proc.retired; i = next++) {
        try {
          results[i] = {
            id: listings[i].id,
            page: await proc.reader.readPage(listings[i].legacyItemId),
          };
        } catch (err) {
          if (!(await proc.goneSoon())) throw err;
          await proc.relaunch();
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

console.log(`resolve (page budget ${BUDGET}, ${CONCURRENCY} readers, one Chrome each)`);
try {
  // Inside the try so the finally below closes every Chrome when a launch
  // or warm-up fails, which would otherwise leave them running for the life
  // of the job. A Chrome that dies while warming is relaunched like any
  // other death.
  await Promise.all(
    processes.map(async (proc) => {
      try {
        await proc.launch();
      } catch (err) {
        if (!(await proc.goneSoon())) throw err;
        console.error(`${proc.name}: Chrome died during warm-up (${err.message.split("\n")[0]})`);
        await proc.relaunch();
      }
    }),
  );

  while (spent < BUDGET) {
    if (active().length === 0) {
      console.log("  every reader has retired; stopping");
      break;
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
  await Promise.all(processes.map((proc) => proc.close()));
}

const relaunches = processes.reduce((n, p) => n + p.relaunches, 0);
console.log(
  `\ntotals ${JSON.stringify(totals)} over ${spent} pages` +
    (relaunches
      ? `, Chrome relaunched ${relaunches} time(s), ${active().length} of ${CONCURRENCY} reader(s) still up`
      : ""),
);
if (spent > 0 && totals.blocked * 2 > spent) {
  console.error("More than half the listing pages were blocked: eBay is refusing this runner");
  process.exit(1);
}
// Explicit, because Playwright keeps a handle open for a Chrome that was
// killed and never relaunched, and the process would otherwise sit here.
process.exit(0);
