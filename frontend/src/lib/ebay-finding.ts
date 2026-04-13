import { buildEbaySearchQuery } from "@/lib/ebay-search-query";

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

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Fetch sold/completed eBay listings by scraping the search results page.
 * eBay server-renders listing cards with title, price, sold date, and condition
 * in the HTML using s-card__* class names.
 */
export async function searchSoldListings(cameraName: string): Promise<EbayListing[]> {
  const query = buildEbaySearchQuery(cameraName);
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "625", // Film Cameras category
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13", // Sort by end date: recent first
    _ipg: "120", // Results per page
  });

  const url = `https://www.ebay.com/sch/i.html?${params}`;

  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`eBay scrape HTTP ${res.status} for "${cameraName}"`);
      return [];
    }
    html = await res.text();
  } catch (error) {
    console.error(`eBay scrape failed for "${cameraName}":`, error);
    return [];
  }

  return parseSoldListings(html);
}

function parseSoldListings(html: string): EbayListing[] {
  const listings: EbayListing[] = [];

  // Split on card caption (each sold listing starts with one)
  const cards = html.split(/<div class=s-card__caption>/);

  for (const card of cards.slice(1)) {
    // Sold date: "Sold  Apr 10, 2026"
    const soldMatch = card.match(/Sold\s+(\w+)\s+(\d+),\s+(\d+)/);
    if (!soldMatch) continue;

    const month = MONTHS[soldMatch[1]] ?? "01";
    const day = soldMatch[2].padStart(2, "0");
    const year = soldMatch[3];
    const date = `${year}-${month}-${day}`;

    // Title: inside s-card__title span
    const titleMatch = card.match(
      /s-card__title[^>]*><span[^>]*>([^<]+)/,
    );
    if (!titleMatch) continue;
    const title = titleMatch[1]
      .replace(/Opens in a new window or tab$/, "")
      .trim()
      .slice(0, 120);

    // Price: first dollar amount in the attributes section
    const priceMatch = card.match(
      /attributes__primary[\s\S]*?>([\d,]+\.\d{2})</,
    );
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(",", ""));
    if (price <= 0) continue;

    // Condition: inside s-card__subtitle span
    const conditionMatch = card.match(
      /s-card__subtitle[\s\S]*?<span[^>]*>([^<]+)/,
    );
    const condition = conditionMatch ? conditionMatch[1].trim() : "";

    // Item ID from /itm/ link
    const itemIdMatch = card.match(/\/itm\/(\d+)/);
    if (!itemIdMatch) continue;
    const itemId = itemIdMatch[1];

    listings.push({
      itemId,
      title,
      price,
      currency: "USD",
      date,
      condition,
      url: `https://www.ebay.com/itm/${itemId}`,
    });
  }

  return listings;
}
