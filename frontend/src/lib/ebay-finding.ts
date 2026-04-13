import { chromium, type Browser, type Page } from "playwright-core";
import chromiumMin from "@sparticuz/chromium-min";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

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
 * Managed browser session for scraping eBay sold listings.
 * Call open() before scraping, close() when done.
 */
export class EbayScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async open(): Promise<void> {
    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      this.browser = await chromium.launch({
        channel: "chrome",
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });
    } else {
      const executablePath = await chromiumMin.executablePath(CHROMIUM_REMOTE_URL);
      this.browser = await chromium.launch({
        executablePath,
        headless: true,
        args: chromiumMin.args,
      });
    }

    const context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });

    this.page = await context.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Scrape sold listings for a camera.
   * Pass the camera name directly — no "camera body" suffix (the LLM filters relevance).
   * Strips parentheses and content inside them to avoid eBay search issues.
   */
  async scrape(cameraName: string): Promise<EbayListing[]> {
    if (!this.page) throw new Error("Browser not open — call open() first");

    // Strip manufacturer prefixes that hurt search
    let query = cameraName;
    for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
      if (query.startsWith(prefix)) {
        query = query.slice(prefix.length);
      }
    }
    // Strip parenthesized content: "Canon EOS M50 (EOS Kiss M)" → "Canon EOS M50"
    query = query.replace(/\s*\([^)]*\)/g, "").trim();
    const params = new URLSearchParams({
      _nkw: query,
      _sacat: "625",
      LH_Sold: "1",
      LH_Complete: "1",
      _sop: "13",
      _ipg: "60",
    });

    const url = `https://www.ebay.com/sch/i.html?${params}`;

    await this.page.goto(url, { waitUntil: "load", timeout: 20000 });
    await this.page.waitForTimeout(3000);

    return this.page.evaluate((months: Record<string, string>) => {
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
        const price = parseFloat(priceMatch[1].replace(",", ""));
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

      return results.slice(0, 20);
    }, MONTHS);
  }
}
