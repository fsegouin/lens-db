/**
 * Can a GitHub runner read eBay listing pages?
 *
 * The sold-search scraper was walled off in July 2026 from these same runners.
 * Listing pages (/itm/<id>) are the one place eBay says whether an ended
 * listing sold or was pulled by its seller, which the Browse API does not, so
 * whether they load from here decides whether the pipeline can check its own
 * sales. From a home connection they load once the session has a cookie.
 *
 * Loads a fixed set of listings whose outcome is already known (read from a
 * home connection on 2026-09-12), twice over, so a block that only starts
 * after some volume shows up too. Prints one line per page and a tally, and
 * always exits 0: the log is the result.
 *
 * Usage: node scraper/ebay-itm-probe.mjs
 */

import { chromium } from "playwright-core";
import { readListingOutcome } from "../frontend/scripts/lib/ebay-listing-page.mjs";

const KNOWN = {
  sold: [
    "117372930052", "168646540126", "267764306504", "377465607617",
    "198604305375", "307140336345", "188620593219", "188807405533",
    "137686620695", "407174916225", "327089595940", "178453407119",
  ],
  seller_ended: [
    "158181842601", "398334250899", "407152893167", "127965070379",
    "407175014059", "318787198918", "318800604859", "820031332981",
    "276036260922", "318779230476",
  ],
  live: ["206519028116", "398253600063"],
};

const expected = new Map(
  Object.entries(KNOWN).flatMap(([outcome, ids]) => ids.map((id) => [id, outcome])),
);
const ids = [...expected.keys()];

const browser = await chromium.launch({ channel: "chrome", headless: true });
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
    .catch((error) => ({ status: () => `error ${error.message.split("\n")[0]}` }));
  await page.waitForTimeout(1_500);
  const title = await page.title().catch(() => "");
  const text = await page.innerText("body").catch(() => "");
  return { status: res?.status() ?? null, title, text };
}

const home = await load("https://www.ebay.com/");
console.log(`home: status ${home.status}, title "${home.title}"`);

const tally = { match: 0, blocked: 0, unread: 0, mismatch: 0 };
for (let pass = 1; pass <= 2; pass++) {
  console.log(`\npass ${pass}`);
  for (const id of ids) {
    const { status, title, text } = await load(`https://www.ebay.com/itm/${id}`);
    const read = readListingOutcome(text) ?? (status === 200 && expected.get(id) === "live" ? "live" : null);
    const want = expected.get(id);
    const verdict =
      read === want ? "match"
        : status !== 200 || /Security Measure|verify yourself|Pardon/i.test(title + text.slice(0, 500))
          ? "blocked"
          : read == null ? "unread" : "mismatch";
    tally[verdict]++;
    console.log(`  ${id} status ${status} want ${want} read ${read ?? "-"} ${verdict} | ${title.slice(0, 70)}`);
    await page.waitForTimeout(1_000);
  }
}
await browser.close();

console.log(`\nTALLY ${JSON.stringify(tally)} of ${ids.length * 2} page loads`);
