/**
 * One eBay listing-page reader on top of a shared Playwright browser: its own
 * context, so its own cookie jar and its own eBay session. Separate contexts
 * rather than separate tabs on one, so a session eBay decides to block, or a
 * renderer that crashes, takes only its own reader down with it.
 */
import { readListingPage } from "../../frontend/scripts/lib/ebay-listing-page.mjs";

class ReaderDied extends Error {}

/** Playwright's wording for a page, context or browser that is closed or crashed. */
function isDeadPageError(err) {
  return /has been closed|Target closed|browser has been closed|crashed/i.test(err?.message ?? "");
}

/**
 * `browserGone()` says whether Chrome itself is still there; a reader whose
 * session dies rebuilds it while the browser lives and gives up otherwise.
 * `onOpen(page)` is a test hook that sees every page the reader creates.
 */
export async function createReader(browser, name, { browserGone = () => false, onOpen } = {}) {
  let context;
  let page;
  // A crashed renderer leaves the page object open but every navigation on it
  // fails from then on, so the crash event is what marks the session dead.
  let crashed = false;

  async function open() {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });
    page = await context.newPage();
    crashed = false;
    const thisPage = page;
    page.on("crash", () => {
      // A crash reported by a page this reader has already replaced is
      // that old session's news, not the current one's.
      if (page !== thisPage) return;
      crashed = true;
      console.error(`${name}: renderer crashed`);
    });
    onOpen?.(page);
  }

  async function load(url) {
    // A crashed or closed page fails every call below; surface that as the
    // reader dying rather than as a blank page, so the session is rebuilt
    // instead of the listing being reported as blocked by eBay.
    if (crashed) throw new ReaderDied("renderer crashed");
    try {
      const res = await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })
        .catch((err) => {
          if (isDeadPageError(err)) throw err;
          return null;
        });
      await page.waitForTimeout(1_500);
      if (crashed) throw new ReaderDied("renderer crashed");
      return {
        status: res?.status() ?? null,
        title: await page.title().catch(() => ""),
        text: await page.innerText("body").catch(() => ""),
      };
    } catch (err) {
      if (err instanceof ReaderDied) throw err;
      if (crashed || page.isClosed() || isDeadPageError(err)) throw new ReaderDied(err.message);
      throw err;
    }
  }

  // eBay answers the first request of a session with no cookies with a 403,
  // whichever page it is. One visit to the home page gets the session going.
  async function warm() {
    await load("https://www.ebay.com/");
  }

  async function readVerdict(itemId) {
    let verdict = "blocked";
    for (let attempt = 0; attempt < 2 && verdict === "blocked"; attempt++) {
      if (attempt > 0) await warm();
      verdict = readListingPage(await load(`https://www.ebay.com/itm/${itemId}`));
    }
    return verdict;
  }

  /**
   * null means the page could not be read (the API then falls back to Browse
   * or defers), which is the honest answer when this reader's session died
   * mid-page. The session is rebuilt for the next listing; if Chrome itself
   * is gone there is nothing to rebuild and the pass has to stop.
   */
  async function readPage(itemId) {
    try {
      return await readVerdict(itemId);
    } catch (err) {
      if (!(err instanceof ReaderDied)) throw err;
      if (browserGone()) throw new Error(`${name}: Chrome is gone (${err.message})`);
      const reason = err.message.split("\n")[0];
      console.error(`${name}: session died on item ${itemId} (${reason}); rebuilding it`);
      await context.close().catch(() => {});
      try {
        await open();
        await warm();
      } catch (rebuildErr) {
        const why = (rebuildErr?.message ?? String(rebuildErr)).split("\n")[0];
        if (browserGone()) throw new Error(`${name}: Chrome is gone (${why})`);
        throw new Error(`${name}: could not rebuild the session (${why})`);
      }
      return null;
    }
  }

  await open();
  return { warm, readPage };
}
