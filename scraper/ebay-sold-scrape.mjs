/**
 * Shared eBay sold-listing scrape used by the camera and lens price actions.
 *
 * The point of this module is that "no listings" is three different things,
 * and the pipeline used to treat them all the same:
 *
 *   ok      — eBay served a results page and we parsed sales from it.
 *   empty   — eBay served a results page that genuinely has no sold items.
 *   blocked — eBay did not serve us a results page at all.
 *
 * Only `ok` and `empty` are real answers about a lens or camera. `blocked`
 * says something about eBay, not about the entity, so the caller must not
 * submit it: storing it would stamp price_estimates.extracted_at and rotate
 * the entity out of the priority queue on the strength of a page we never
 * actually read. That is what silently happened between 2026-07-23 and
 * 2026-09-02, when every run reported "400 lenses, 0 listings" as success.
 *
 * eBay blocks in three shapes, and only the first is an HTTP error:
 *   - 403 "Something went wrong on our end" (Akamai hard block)
 *   - 200 "Security Measure | eBay" — a verification challenge page
 *   - 200 results shell with none of the expected card markup
 */

export const OUTCOME = {
  OK: "ok",
  EMPTY: "empty",
  BLOCKED: "blocked",
};

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** eBay's sold+completed search for a category-625 keyword query. */
function soldSearchUrl(query) {
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

/**
 * Scrape one sold search.
 *
 * @returns {Promise<{outcome: string, reason?: string, listings: object[]}>}
 */
export async function scrapeSoldListings(page, query) {
  const blocked = (reason) => ({ outcome: OUTCOME.BLOCKED, reason, listings: [] });

  let response;
  try {
    response = await page.goto(soldSearchUrl(query), {
      waitUntil: "load",
      timeout: 20000,
    });
  } catch (error) {
    // A navigation failure is not evidence about the entity either.
    return blocked(`navigation failed: ${error.message}`);
  }

  const status = response?.status() ?? 0;
  if (status === 403 || status === 429 || status >= 500) {
    return blocked(`http ${status}`);
  }

  // eBay serves its bot challenge with a 200, so the status code alone
  // cannot tell us whether we were let in.
  const challenge = await page.evaluate(() =>
    /Security Measure|Please verify yourself/i.test(
      `${document.title} ${document.body.innerText.slice(0, 1000)}`,
    ),
  );
  if (challenge) return blocked("verification challenge");

  try {
    await page.waitForSelector(".s-card__title", { timeout: 8000 });
  } catch {
    // No cards. Only call this an honest "no sales" if the page actually
    // says so — otherwise we are looking at a shell we do not understand,
    // and guessing "empty" would poison the estimate.
    const looksLikeResults = await page.evaluate(() =>
      /No exact matches found|did not match any items|\b0 results\b|\d[\d,]*\s+results?\s+for/i
        .test(document.body.innerText),
    );
    return looksLikeResults
      ? { outcome: OUTCOME.EMPTY, listings: [] }
      : blocked("no results markup");
  }

  const { listings, cardCount } = await page.evaluate((months) => {
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
        ".su-card-container__attributes__primary .s-card__attribute-row:first-child .su-styled-text",
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

    return { listings: results.slice(0, 20), cardCount: cards.length };
  }, MONTHS);

  // Cards rendered but nothing parsed out of them means eBay changed the
  // markup under us. Treating that as "no sales" is how a DOM change turns
  // into thousands of silently blanked estimates, so refuse the answer.
  if (cardCount > 0 && listings.length === 0) {
    return blocked(`markup mismatch (${cardCount} cards, 0 parsed)`);
  }

  return { outcome: OUTCOME.OK, listings };
}
