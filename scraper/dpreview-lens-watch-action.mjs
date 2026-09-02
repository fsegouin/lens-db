/**
 * DPReview New-Lens Watcher — runs as a GitHub Action.
 *
 * 1. GET /api/cron/dpreview-lenses → list of DPReview slugs already processed
 * 2. Scan the DPReview lens index (sorted by announcement date) for unseen products
 * 3. For each unseen product: scrape the spec table + images from its product page
 * 4. POST /api/cron/dpreview-lenses → server dedupes and queues new lenses for review
 *
 * Env: API_URL, CRON_SECRET, PAGES (index pages to scan, default 1),
 *      LIMIT (max candidates to submit, for local testing)
 */

import { chromium } from "playwright-core";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const PAGES = Math.max(1, parseInt(process.env.PAGES || "1", 10) || 1);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const DELAY_BETWEEN_PAGES_MS = 2000;

// WordPress path-based pagination: page N lives at /products/lenses/page/N/
// (a ?page=N query param is silently ignored and serves page 1)
const INDEX_BASE = "https://www.dpreview.com/products/lenses";
const INDEX_QUERY = "?sort=announcementDate&view=list";

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
  const res = await fetch(`${API_URL}/api/cron/dpreview-lenses`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to get seen slugs: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitCandidate(candidate) {
  const res = await fetch(`${API_URL}/api/cron/dpreview-lenses`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(candidate),
  });
  if (!res.ok) {
    console.error(`  Failed to submit: ${res.status} ${await res.text()}`);
    return { status: "error" };
  }
  return res.json();
}

/** Scrape one index page → [{ slug, url, name, year, price }] */
async function scrapeIndexPage(page, pageNum) {
  const url =
    pageNum > 1
      ? `${INDEX_BASE}/page/${pageNum}/${INDEX_QUERY}`
      : `${INDEX_BASE}${INDEX_QUERY}`;
  // "domcontentloaded" instead of "load": ad/tracker requests can keep the
  // load event from ever firing on dpreview.com
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('a[href*="/lenses/"]', { timeout: 15000 }).catch(() => {});

  return page.evaluate(() => {
    const bySlug = new Map();
    for (const a of document.querySelectorAll('a[href*="/products/"]')) {
      const href = a.getAttribute("href") || "";
      const match = href.match(/^(?:https?:\/\/www\.dpreview\.com)?\/products\/[^/]+\/lenses\/([^/?#]+)\/?$/);
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
    return [...bySlug.values()].filter((r) => r.name.length >= 2);
  });
}

/** Scrape one product page → { name, specTable, imageUrls } */
async function scrapeProductPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("h1", { timeout: 15000 }).catch(() => {});

  return page.evaluate(() => {
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
    const isProductImage = (src) =>
      /^https:\/\/([^/]+\.)?(img-dpreview\.com|dpreview\.com)\//.test(src) &&
      /(\/files\/|\/wp-content\/uploads\/|\/products\/)/.test(src) &&
      !/\/sample_galleries\//.test(src); // sample photos taken WITH the lens
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

    return { name, specTable, imageUrls: urls.slice(0, 4) };
  });
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }

  console.log(`Fetching seen slugs from ${API_URL}...`);
  const { seenSlugs, stats } = await getSeenSlugs();
  const seen = new Set(seenSlugs);
  console.log(`Registry: ${JSON.stringify(stats)}\n`);

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

  const counts = { created: 0, matched: 0, review: 0, seen: 0, error: 0 };

  try {
    const unseen = [];
    for (let p = 1; p <= PAGES; p++) {
      if (p > 1) await delay(DELAY_BETWEEN_PAGES_MS);
      let rows;
      try {
        rows = await scrapeIndexPage(page, p);
      } catch (error) {
        // Page 1 failing is fatal (markup-drift alarm); a later page timing out
        // just means its lenses wait for the next run
        if (p === 1) throw error;
        console.warn(`Index page ${p}: skipped (${error.message.split("\n")[0]})`);
        continue;
      }
      if (p === 1 && rows.length === 0) {
        throw new Error("Index page 1 yielded 0 lens rows — DPReview markup may have changed");
      }
      const fresh = rows.filter((r) => !seen.has(r.slug));
      console.log(`Index page ${p}: ${rows.length} lenses, ${fresh.length} unseen`);
      unseen.push(...fresh);
    }

    const toProcess = unseen.slice(0, LIMIT);
    console.log(`\nProcessing ${toProcess.length} unseen products\n`);

    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i];
      await delay(DELAY_BETWEEN_PAGES_MS);

      try {
        const product = await scrapeProductPage(page, row.url);
        const candidate = {
          dpreviewSlug: row.slug,
          dpreviewUrl: row.url,
          name: product.name || row.name,
          specTable: product.specTable,
          imageUrls: product.imageUrls,
          year: row.year,
          price: row.price,
        };
        const result = await submitCandidate(candidate);
        counts[result.status] = (counts[result.status] ?? 0) + 1;
        console.log(`${i + 1}/${toProcess.length} ${candidate.name}: ${result.status}`);
      } catch (error) {
        counts.error++;
        console.error(`${i + 1}/${toProcess.length} ${row.name}: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    `\nDone: ${counts.created} queued as new, ${counts.matched} matched existing (enriched), ` +
    `${counts.review} uncertain (run scraper/dpreview-review-cli.mjs), ` +
    `${counts.seen} already seen, ${counts.error} errors`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
