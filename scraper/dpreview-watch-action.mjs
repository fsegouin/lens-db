/**
 * DPReview New-Product Watcher — runs as a GitHub Action.
 *
 * 1. GET  <endpoint> → list of DPReview slugs already processed
 * 2. Scan the DPReview index (sorted by announcement date) for unseen products
 * 3. For each unseen product: scrape the spec table + images from its page
 * 4. POST <endpoint> → server dedupes and queues new products for review
 *
 * Handles both halves of the watcher, selected by ENTITY. The index and
 * product-page markup is identical for lenses and cameras — only the index
 * URL, the category segments in a product link, and the endpoint differ — so
 * the extraction heuristics that DPReview's markup drift keeps breaking live
 * in one place rather than two.
 *
 * Env: ENTITY ("lenses" | "cameras", default "lenses"), API_URL, CRON_SECRET,
 *      PAGES (index pages to scan, default 1),
 *      LIMIT (max candidates to submit, for local testing)
 */

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
    // them — every one would arrive as a new-camera pending edit for a
    // product class the site does not cover. Add the segment here to take
    // them.
    categorySegments: ["cameras", "slrs", "compacts"],
    endpoint: "/api/cron/dpreview-cameras",
  },
};

const ENTITY_KEY = process.env.ENTITY || "lenses";
const ENTITY = ENTITIES[ENTITY_KEY];
if (!ENTITY) {
  console.error(`Unknown ENTITY "${ENTITY_KEY}" — expected one of: ${Object.keys(ENTITIES).join(", ")}`);
  process.exit(1);
}

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const PAGES = Math.max(1, parseInt(process.env.PAGES || "1", 10) || 1);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const DELAY_BETWEEN_PAGES_MS = 2000;

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
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to get seen slugs: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitCandidate(candidate) {
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, {
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

/** Scrape one index page → { rows: [{ slug, url, name, year, price }], unknownSegments } */
async function scrapeIndexPage(page, pageNum) {
  const url =
    pageNum > 1
      ? `${ENTITY.indexBase}/page/${pageNum}/${INDEX_QUERY}`
      : `${ENTITY.indexBase}${INDEX_QUERY}`;
  // "domcontentloaded" instead of "load": ad/tracker requests can keep the
  // load event from ever firing on dpreview.com
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Wait for a real product link rather than any /<category>/ href — the site
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
      { timeout: 15000 },
    )
    .catch(() => {});

  return page.evaluate(
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
      !/\/sample_galleries\//.test(src); // sample photos taken WITH the product
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

  console.log(`Watching DPReview ${ENTITY.nounPlural}`);
  console.log(`Fetching seen slugs from ${API_URL}${ENTITY.endpoint}...`);
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
  const unknownSegmentsSeen = new Set();

  try {
    const unseen = [];
    for (let p = 1; p <= PAGES; p++) {
      if (p > 1) await delay(DELAY_BETWEEN_PAGES_MS);
      let result;
      try {
        result = await scrapeIndexPage(page, p);
      } catch (error) {
        // Page 1 failing is fatal (markup-drift alarm); a later page timing out
        // just means its products wait for the next run
        if (p === 1) throw error;
        console.warn(`Index page ${p}: skipped (${error.message.split("\n")[0]})`);
        continue;
      }
      const { rows, unknownSegments } = result;
      for (const segment of unknownSegments) unknownSegmentsSeen.add(segment);
      if (p === 1 && rows.length === 0) {
        throw new Error(
          `Index page 1 yielded 0 ${ENTITY.noun} rows — DPReview markup may have changed`,
        );
      }
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
    `${counts.review} uncertain (run ENTITY=${ENTITY_KEY} scraper/dpreview-review-cli.mjs), ` +
    `${counts.seen} already seen, ${counts.error} errors`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
