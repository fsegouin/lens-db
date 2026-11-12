/**
 * DPReview New-Product Watcher: runs weekly on a self-hosted scheduler.
 *
 * 1. GET  <endpoint> → list of DPReview slugs already processed
 * 2. Scan the DPReview index (sorted by announcement date) for unseen products
 * 3. For each unseen product: scrape the spec table + images from its page
 * 4. POST <endpoint> → server dedupes and queues new products for review
 *
 * Handles both halves of the watcher, selected by ENTITY. The index and
 * product-page markup is identical for lenses and cameras: only the index
 * URL, the category segments in a product link, and the endpoint differ, so
 * the extraction heuristics that DPReview's markup drift keeps breaking live
 * in one place rather than two.
 *
 * Env: ENTITY ("lenses" | "cameras", default "lenses"), API_URL, CRON_SECRET,
 *      PAGES (index pages to scan, default 1),
 *      LIMIT (max candidates to submit, for local testing),
 *      DRY_RUN=1 (skip the API: treat every product as unseen, print instead
 *      of submitting),
 *      HEADLESS=0 (visible Chrome; run under xvfb-run where there is no
 *      display),
 *      CHROME_PATH (a Chromium executable, for hosts without Google Chrome),
 *      DEBUG_DIR (where a failed index page's screenshot and HTML are saved,
 *      default scraper/dpreview-debug)
 *
 * Cloudflare sits in front of DPReview and, some weeks, answers with a page
 * that holds no product links: a quick load, then a list that never appears.
 * Every page load is therefore retried in a fresh browser context with
 * a backoff, and a run that still fails says whether it was blocked or found
 * a page it could not read, and saves that page.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ENTITIES = {
  lenses: {
    noun: "lens",
    nounPlural: "lenses",
    indexBase: "https://www.dpreview.com/products/lenses",
    categorySegments: ["lenses"],
    endpoint: "/api/cron/dpreview-lenses",
  },
  cameras: {
    noun: "camera",
    nounPlural: "cameras",
    indexBase: "https://www.dpreview.com/products/cameras",
    // Bodies keep the category segment they were first filed under, so the
    // camera index links to several shapes at once: mirrorless and DSLRs
    // alike sit under /slrs/, fixed-lens bodies under /compacts/, and only
    // the newest entries use /cameras/. Matching only /cameras/ finds three
    // products in 125 pages of index.
    //
    // "actioncams" is deliberately absent. DPReview lists GoPro, DJI Osmo
    // and Insta360 bodies in this same index, and the database holds none of
    // them: every one would arrive as a new-camera pending edit for a
    // product class the site does not cover. Add the segment here to take
    // them.
    categorySegments: ["cameras", "slrs", "compacts"],
    endpoint: "/api/cron/dpreview-cameras",
  },
};

const ENTITY_KEY = process.env.ENTITY || "lenses";
const ENTITY = Object.hasOwn(ENTITIES, ENTITY_KEY) ? ENTITIES[ENTITY_KEY] : undefined;
if (!ENTITY) {
  console.error(`Unknown ENTITY "${ENTITY_KEY}": expected one of: ${Object.keys(ENTITIES).join(", ")}`);
  process.exit(1);
}

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
// The bearer rides on every API request, so it only goes over https, or plain
// http to a dev server on this machine
if (CRON_SECRET && !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/i.test(API_URL)) {
  console.error(`Refusing to send CRON_SECRET to ${API_URL}: use an https API_URL`);
  process.exit(1);
}
const PAGES = Math.max(1, parseInt(process.env.PAGES || "1", 10) || 1);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const DRY_RUN = process.env.DRY_RUN === "1";
const HEADLESS = process.env.HEADLESS !== "0";
const CHROME_PATH = process.env.CHROME_PATH;
const DEBUG_DIR = process.env.DEBUG_DIR || fileURLToPath(new URL("./dpreview-debug", import.meta.url));
const DELAY_BETWEEN_PAGES_MS = 2000;

// Four attempts with 3 min 20 s of backoff between them, up to about eight
// minutes with each attempt's own waits. A challenge that a real browser
// clears on its own does so within seconds, so each attempt also waits up to
// LIST_WAIT_MS for the list to appear before giving up on that attempt.
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [20_000, 60_000, 120_000];
const LIST_WAIT_MS = 30_000;
// Product pages that fail in a row, after their own retries, before the run
// stops: past that DPReview is refusing us, and every further product would
// only spend up to eight minutes of the job's hour on retries.
const MAX_CONSECUTIVE_PRODUCT_FAILURES = 3;

// The challenge interstitial's own elements and titles. Normal DPReview pages
// also load a /cdn-cgi/challenge-platform/ script for bot scoring, so that
// script alone does not count.
const CHALLENGE_SELECTOR =
  '#challenge-form, #challenge-running, #challenge-stage, .cf-turnstile, iframe[src*="challenges.cloudflare.com"]';
const CHALLENGE_TITLE_SOURCE = "just a moment|attention required|access denied|verify you are human";

// WordPress path-based pagination: page N lives at /products/<index>/page/N/
// (a ?page=N query param is silently ignored and serves page 1)
const INDEX_QUERY = "?sort=announcementDate&view=list";

// Product links are /products/<brand>/<category>/<slug>. Every category
// DPReview currently uses is claimed by one of the two entities above; a
// segment outside this set is reported rather than silently skipped, because
// a new category would otherwise cost us a whole class of products.
const KNOWN_SEGMENTS = new Set([
  ...Object.values(ENTITIES).flatMap((e) => e.categorySegments),
  // Known, and knowingly not collected (see the cameras entry above)
  "actioncams",
  "page",
  "search",
  "compare",
]);

const PRODUCT_RE_SOURCE = `^(?:https?://www\\.dpreview\\.com)?/products/[^/]+/(?:${ENTITY.categorySegments.join("|")})/([^/?#]+)/?$`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(extra = {}) {
  return {
    ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    ...extra,
  };
}

async function getSeenSlugs() {
  if (DRY_RUN) return { seenSlugs: [], stats: { dryRun: true } };
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, { headers: authHeaders(), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`Failed to get seen slugs: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitCandidate(candidate) {
  if (DRY_RUN) {
    const specs = Object.keys(candidate.specTable).length;
    console.log(`  [dry run] ${candidate.dpreviewUrl}: ${specs} spec rows, ${candidate.imageUrls.length} images`);
    return { status: "seen" };
  }
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(candidate),
    // Just past the route's 300 s maxDuration, so it fires only once the platform has given up.
    signal: AbortSignal.timeout(330_000),
  });
  if (!res.ok) {
    console.error(`  Failed to submit: ${res.status} ${await res.text()}`);
    return { status: "error" };
  }
  return res.json();
}

function firstLine(message) {
  return String(message).split("\n")[0];
}

/** Page-derived text for a log line: no control characters or terminal escapes */
function forLog(text) {
  return String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ");
}

/**
 * What a page that could not be read actually was, for the log. `blocked`
 * reads the page as it is now, not the first response: a challenge that
 * cleared itself leaves a 403 behind it on a page that is fine.
 */
async function describePage(page, response) {
  const status = response?.status() ?? 0;
  const cfMitigated = response?.headers()["cf-mitigated"];
  let title, challenge, text;
  try {
    ({ title, challenge, text } = await page.evaluate(
      ({ selector, titleSource }) => ({
        title: document.title,
        challenge:
          Boolean(document.querySelector(selector)) ||
          new RegExp(titleSource, "i").test(document.title),
        text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160),
      }),
      { selector: CHALLENGE_SELECTOR, titleSource: CHALLENGE_TITLE_SOURCE },
    ));
  } catch (error) {
    // Usually a navigation mid-read: the page changed under us, so nothing
    // is known about it
    return { blocked: false, summary: `http ${status}, page unreadable (${firstLine(error.message)})` };
  }
  const blocked = challenge;
  const summary =
    `http ${status}${cfMitigated ? `, cf-mitigated ${cfMitigated}` : ""}, ` +
    `title "${forLog(title)}"${blocked ? "" : `, text "${forLog(text)}"`}`;
  return { blocked, summary };
}

/**
 * Run one page load up to MAX_ATTEMPTS times. `attempt(page)` returns
 * { ok: true, value } or { ok: false, reason, blocked, snapshot?, final? };
 * a throw (navigation timeout, connection reset, a context that would not
 * open) counts as a failed attempt too. `final` means retrying cannot help.
 * Each retry gets a fresh browser context, so a challenge cookie from the
 * refused attempt is not carried into the next one. Returns the last failure
 * when all fail, carrying the last snapshot any attempt took.
 */
async function withRetries(session, label, attempt) {
  let failure;
  let snapshot;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    if (n > 1) {
      const wait = RETRY_BACKOFF_MS[n - 2] ?? RETRY_BACKOFF_MS.at(-1);
      console.warn(
        `  ${label}: attempt ${n - 1} of ${MAX_ATTEMPTS} failed, ${failure.reason}; ` +
        `retrying in ${wait / 1000} s with a fresh browser context`,
      );
      await delay(wait);
    }
    try {
      if (n > 1) await session.reset();
      const outcome = await attempt(session.page);
      if (outcome.ok) {
        if (n > 1) console.log(`  ${label}: succeeded on attempt ${n}`);
        return outcome;
      }
      failure = outcome;
    } catch (error) {
      failure = {
        ok: false,
        reason: `load failed: ${firstLine(error.message)}`,
        blocked: false,
        snapshot: session.page ? await snapshotPage(session.page) : undefined,
      };
    }
    snapshot = failure.snapshot ?? snapshot;
    if (failure.final) break;
  }
  return { ...failure, snapshot };
}

/** Save what a failed page looked like, to look at after a failed run */
async function saveDebug(name, snapshot) {
  if (!snapshot) return;
  try {
    await mkdir(DEBUG_DIR, { recursive: true });
    await writeFile(`${DEBUG_DIR}/${name}.html`, snapshot.html);
    await writeFile(`${DEBUG_DIR}/${name}.png`, snapshot.png);
    console.warn(`  Saved ${DEBUG_DIR}/${name}.html and .png`);
  } catch (error) {
    console.warn(`  Could not save the failed page: ${firstLine(error.message)}`);
  }
}

async function snapshotPage(page) {
  try {
    return { html: await page.content(), png: await page.screenshot() };
  } catch {
    return undefined;
  }
}

/**
 * Scrape one index page. Resolves to { ok: true, value: { rows, unknownSegments } }
 * with rows [{ slug, url, name, year, price }], or a failure when the page
 * held no product rows.
 */
async function scrapeIndexPage(page, pageNum) {
  const url =
    pageNum > 1
      ? `${ENTITY.indexBase}/page/${pageNum}/${INDEX_QUERY}`
      : `${ENTITY.indexBase}${INDEX_QUERY}`;
  // "domcontentloaded" instead of "load": ad/tracker requests can keep the
  // load event from ever firing on dpreview.com
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Wait for a real product link rather than any /<category>/ href: the site
  // nav carries category links that are present immediately, so waiting on
  // those returns before the list itself has rendered.
  await page
    .waitForFunction(
      (reSource) => {
        const re = new RegExp(reSource);
        return [...document.querySelectorAll('a[href*="/products/"]')].some((a) =>
          re.test(a.getAttribute("href") || ""),
        );
      },
      PRODUCT_RE_SOURCE,
      { timeout: LIST_WAIT_MS },
    )
    .catch(() => {});

  const result = await page.evaluate(
    ({ reSource, knownSegments }) => {
      const re = new RegExp(reSource);
      const bySlug = new Map();
      const unknownSegments = new Set();
      for (const a of document.querySelectorAll('a[href*="/products/"]')) {
        const href = a.getAttribute("href") || "";

        const parts = href
          .replace(/^https?:\/\/www\.dpreview\.com/, "")
          .split("?")[0]
          .split("/")
          .filter(Boolean);
        if (parts.length === 4 && parts[0] === "products" && !knownSegments.includes(parts[2])) {
          unknownSegments.add(parts[2]);
        }

        const match = href.match(re);
        if (!match) continue;
        const slug = match[1];
        const name = (a.textContent || "").trim();
        const row = a.closest("tr") || a.closest("li") || a.parentElement?.parentElement;
        const rowText = row ? row.innerText || "" : "";
        const yearMatch = rowText.match(/\b(19|20)\d{2}\b/);
        const priceMatch = rowText.match(/\$[\d,]+/);

        const existing = bySlug.get(slug);
        // Keep the longest anchor text for a given product (thumbnails link too)
        if (!existing || name.length > existing.name.length) {
          bySlug.set(slug, {
            slug,
            url: `https://www.dpreview.com/products/${href.split("/products/")[1].replace(/\/$/, "")}`,
            name,
            year: yearMatch ? parseInt(yearMatch[0], 10) : undefined,
            price: priceMatch ? priceMatch[0] : undefined,
          });
        }
      }
      return {
        rows: [...bySlug.values()].filter((r) => r.name.length >= 2),
        unknownSegments: [...unknownSegments],
      };
    },
    { reSource: PRODUCT_RE_SOURCE, knownSegments: [...KNOWN_SEGMENTS] },
  );
  if (result.rows.length > 0) return { ok: true, value: result };
  // A backfill asked for more pages than the index has
  if (pageNum > 1 && response?.status() === 404) {
    return { ok: false, final: true, blocked: false, reason: "http 404, past the end of the index" };
  }

  const { blocked, summary } = await describePage(page, response);
  return {
    ok: false,
    blocked,
    reason: blocked ? `blocked by a challenge (${summary})` : `0 ${ENTITY.noun} rows (${summary})`,
    snapshot: await snapshotPage(page),
  };
}

/**
 * Scrape one product page. Resolves to { ok: true, value: { name, specTable,
 * imageUrls } }, or a failure when the page was a challenge or had no title:
 * submitting that would queue a product with an empty spec table, and mark
 * it seen so no later run would fetch it again.
 */
async function scrapeProductPage(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // The challenge interstitial carries an h1 of its own (the host name), so
  // wait for an h1 on a page that is not the interstitial: a challenge that
  // clears itself gets the time to.
  await page
    .waitForFunction(
      ({ selector, titleSource }) =>
        document.querySelector("h1") &&
        !document.querySelector(selector) &&
        !new RegExp(titleSource, "i").test(document.title),
      { selector: CHALLENGE_SELECTOR, titleSource: CHALLENGE_TITLE_SOURCE },
      { timeout: LIST_WAIT_MS },
    )
    .catch(() => {});

  const product = await page.evaluate(({ selector, titleSource }) => {
    // Read in the same pass as the product, so a navigation between two
    // reads cannot pair a challenge page's h1 with a clean verdict
    const challenge =
      Boolean(document.querySelector(selector)) || new RegExp(titleSource, "i").test(document.title);
    const h1 = document.querySelector("h1");
    const name = (h1?.textContent || "").replace(/\s*Overview$/i, "").trim();

    // Specs live as dt/dd pairs inside the (collapsed) "Full specs" modal
    // (.wp-block-dpreview-product-full-specs-modal__acc-*). Query dt/dd
    // generically so a class rename doesn't break extraction.
    const specTable = {};
    const scope = document.querySelector('[class*="full-specs"]') || document;
    for (const dt of scope.querySelectorAll("dt")) {
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") continue;
      const label = (dt.textContent || "").trim().replace(/\s+/g, " ");
      const value = (dd.textContent || "").trim().replace(/\s+/g, " ");
      if (label && value && label.length <= 100 && value.length <= 500) {
        specTable[label] = value;
      }
    }

    // Announcement date usually appears as body text, not a spec row
    if (!specTable["Announced"]) {
      const announced = (document.body.innerText || "").match(
        /Announced[:\s]+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+\.?\s+\d{4})/
      );
      if (announced) specTable["Announced"] = announced[1];
    }

    // Dedupe images on the query-less URL (?w=NNN variants are resizes of the
    // same file); article hero images (16x9 leads) are filtered out when
    // product shots exist.
    const imageUrls = new Set();
    const isProductImage = (src) => {
      let url;
      try {
        url = new URL(src);
      } catch {
        return false;
      }
      return (
        url.protocol === "https:" &&
        /(^|\.)(img-dpreview\.com|dpreview\.com)$/i.test(url.hostname) &&
        /(\/files\/|\/wp-content\/uploads\/|\/products\/)/.test(url.pathname) &&
        !/\/sample_galleries\//.test(url.pathname) // sample photos taken WITH the product
      );
    };
    const baseUrl = (src) => src.split("?")[0];
    const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    if (og && isProductImage(og)) imageUrls.add(baseUrl(og));
    for (const img of document.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (isProductImage(src)) imageUrls.add(baseUrl(src));
    }
    let urls = [...imageUrls];
    const productShots = urls.filter((u) => !/16x9|-lead-?/i.test(u));
    if (productShots.length > 0) urls = productShots;
    // DPReview names product shots "PI_*" / "M-PI-*"; prefer those over
    // article photos when any exist
    const piShots = urls.filter((u) => /\/(m-)?pi[-_]/i.test(u));
    if (piShots.length > 0) urls = piShots;

    return { challenge, name, specTable, imageUrls: urls.slice(0, 4) };
  }, { selector: CHALLENGE_SELECTOR, titleSource: CHALLENGE_TITLE_SOURCE });

  const { challenge, ...value } = product;
  if (!challenge && value.name && !/dpreview\.com$/i.test(value.name)) return { ok: true, value };
  const { blocked, summary } = await describePage(page, response);
  return {
    ok: false,
    blocked,
    reason: blocked ? `blocked by a challenge (${summary})` : `no product title (${summary})`,
  };
}

/**
 * The User-Agent of the Chrome actually running, minus "Headless". A fixed
 * string goes stale as the host's Chrome updates, and a UA several versions
 * away from what the browser's client hints and features report is itself a
 * bot signal.
 */
function userAgentFor(browser) {
  const major = browser.version().split(".")[0];
  const platform =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10_15_7"
      : process.platform === "win32"
        ? "Windows NT 10.0; Win64; x64"
        : "X11; Linux x86_64";
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/** One browser context and its page, replaced wholesale between retries */
function createSession(browser) {
  const userAgent = userAgentFor(browser);
  const session = {
    context: undefined,
    page: undefined,
    async open() {
      session.context = await browser.newContext({
        userAgent,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
      });
      session.page = await session.context.newPage();
    },
    async reset() {
      await session.context?.close().catch(() => {});
      await session.open();
    },
  };
  return session;
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set; requests will be unauthenticated");
  }

  console.log(`Watching DPReview ${ENTITY.nounPlural}`);
  console.log(`Fetching seen slugs from ${API_URL}${ENTITY.endpoint}...`);
  const { seenSlugs, stats } = await getSeenSlugs();
  const seen = new Set(seenSlugs);
  console.log(`Registry: ${JSON.stringify(stats)}\n`);

  const browser = await chromium.launch({
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: "chrome" }),
    headless: HEADLESS,
    // Without these Chrome reports navigator.webdriver = true and shows the
    // automation infobar, both of which bot scoring reads.
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  console.log(`Chrome ${browser.version()}, ${HEADLESS ? "headless" : "visible"}`);
  const session = createSession(browser);

  const counts = { created: 0, matched: 0, review: 0, seen: 0, error: 0 };
  const unknownSegmentsSeen = new Set();
  let failure;

  try {
    await session.open();
    const unseen = [];
    for (let p = 1; p <= PAGES; p++) {
      if (p > 1) await delay(DELAY_BETWEEN_PAGES_MS);
      const outcome = await withRetries(session, `Index page ${p}`, (page) =>
        scrapeIndexPage(page, p),
      );
      if (!outcome.ok) {
        // Page 1 failing is fatal: either DPReview kept refusing us, or the
        // markup changed under the scraper. A later page failing just means
        // its products wait for the next run.
        if (p > 1 && outcome.final) {
          console.log(`Index page ${p}: ${outcome.reason}, stopping the scan`);
          break;
        }
        if (p > 1) {
          console.warn(`Index page ${p}: skipped after ${MAX_ATTEMPTS} attempts, ${outcome.reason}`);
          continue;
        }
        await saveDebug(`${ENTITY_KEY}-index-page-1`, outcome.snapshot);
        throw new Error(
          outcome.blocked
            ? `Index page 1 still blocked after ${MAX_ATTEMPTS} attempts: ${outcome.reason}`
            : `Index page 1 unreadable after ${MAX_ATTEMPTS} attempts, DPReview markup may ` +
              `have changed: ${outcome.reason}`,
        );
      }
      const { rows, unknownSegments } = outcome.value;
      for (const segment of unknownSegments) unknownSegmentsSeen.add(segment);
      const fresh = rows.filter((r) => !seen.has(r.slug));
      console.log(`Index page ${p}: ${rows.length} ${ENTITY.nounPlural}, ${fresh.length} unseen`);
      unseen.push(...fresh);
    }

    if (unknownSegmentsSeen.size > 0) {
      console.warn(
        `\nNote: unrecognised product category segment(s) on the index: ` +
        `${[...unknownSegmentsSeen].join(", ")}. DPReview may have added a category ` +
        `that no entity in this script claims, and its products are being skipped.`,
      );
    }

    const toProcess = unseen.slice(0, LIMIT);
    console.log(`\nProcessing ${toProcess.length} unseen products\n`);

    let failedInARow = 0;
    for (let i = 0; i < toProcess.length; i++) {
      if (failedInARow >= MAX_CONSECUTIVE_PRODUCT_FAILURES) {
        failure =
          `${failedInARow} product pages in a row failed after ${MAX_ATTEMPTS} attempts each; ` +
          `stopped with ${toProcess.length - i} left for the next run`;
        break;
      }
      const row = toProcess[i];
      await delay(DELAY_BETWEEN_PAGES_MS);

      try {
        const outcome = await withRetries(session, forLog(row.name), (page) =>
          scrapeProductPage(page, row.url),
        );
        if (!outcome.ok) {
          // Not submitted, so not recorded as seen: next week's run tries it again
          counts.error++;
          failedInARow++;
          console.error(`${i + 1}/${toProcess.length} ${forLog(row.name)}: skipped, ${outcome.reason}`);
          continue;
        }
        failedInARow = 0;
        const product = outcome.value;
        const candidate = {
          dpreviewSlug: row.slug,
          dpreviewUrl: row.url,
          name: product.name,
          specTable: product.specTable,
          imageUrls: product.imageUrls,
          year: row.year,
          price: row.price,
        };
        const result = await submitCandidate(candidate);
        counts[result.status] = (counts[result.status] ?? 0) + 1;
        console.log(`${i + 1}/${toProcess.length} ${forLog(candidate.name)}: ${result.status}`);
      } catch (error) {
        counts.error++;
        console.error(`${i + 1}/${toProcess.length} ${forLog(row.name)}: ${error.message}`);
      }
    }
    if (!failure && toProcess.length > 0 && counts.error === toProcess.length) {
      failure = `all ${toProcess.length} products failed`;
    }
  } finally {
    await browser.close();
  }
  console.log(
    `\nDone: ${counts.created} queued as new, ${counts.matched} matched existing (enriched), ` +
    `${counts.review} uncertain (run ENTITY=${ENTITY_KEY} scraper/dpreview-review-cli.mjs), ` +
    `${counts.seen} already seen, ${counts.error} errors`
  );
  // Skipped products are not marked seen, so a run that skipped everything
  // would otherwise stay green while queueing nothing, week after week
  if (failure) {
    console.error(`\nFailed: ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
