/**
 * Local sandbox for the eBay sold-listings parser.
 *
 * Runs the exact same request-building + parsing code as the GitHub Actions
 * (imported from lib/ebay-sold.mjs — nothing duplicated), against arbitrary
 * test queries, with no API_URL/CRON_SECRET required.
 *
 * Usage:
 *   node scraper/ebay-sandbox.mjs login [--state <path>]
 *       Open headed Chrome on eBay's sign-in page, wait for you to log in,
 *       then save the session (cookies/storage) as a Playwright storageState
 *       JSON — the value for the EBAY_STORAGE_STATE GitHub secret.
 *
 *   node scraper/ebay-sandbox.mjs search "<name>" [...] [options]
 *       Scrape sold listings for each name and print the parsed result.
 *       --state <path>    Load a captured storageState (signed-in scraping)
 *       --headed          Show the browser window
 *       --dump-html <dir> Save each page's final HTML + URL for inspection
 *       Exits non-zero if any query hits the sign-in wall.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import {
  createEbayContext,
  delay,
  logScrapeResult,
  scrapeSoldListings,
  stripParens,
} from "./lib/ebay-sold.mjs";

const DEFAULT_STATE_PATH = "scraper/.secrets/ebay-storage-state.json";

async function login(statePath) {
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  // Same context options as CI so the captured session matches the fingerprint
  // it will be replayed under
  const context = await createEbayContext(browser);
  const page = await context.newPage();
  await page.goto("https://www.ebay.com/signin/");

  console.log("A Chrome window is open on eBay's sign-in page.");
  console.log("Log in (complete any 2FA), then come back here.\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press Enter once you are signed in... ");
  rl.close();

  await mkdir(dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  await browser.close();

  const size = (await readFile(statePath)).length;
  console.log(`\nSession saved to ${statePath} (${(size / 1024).toFixed(1)} KB)`);
  if (size > 48 * 1024) {
    console.warn("Warning: file is close to GitHub's 64KB secret limit");
  }
  console.log("\nNext steps:");
  console.log(`  1. Validate: node scraper/ebay-sandbox.mjs search "Minolta AF 85mm F/1.4" --state ${statePath}`);
  console.log(`  2. Ship:     gh secret set EBAY_STORAGE_STATE --env production < ${statePath}`);
}

async function search(queries, { statePath, headed, dumpDir }) {
  let storageState;
  if (statePath) {
    storageState = JSON.parse(await readFile(statePath, "utf8"));
    console.log(`Loaded storageState from ${statePath}`);
  } else {
    console.log("No --state given — scraping signed-out (expect the sign-in wall)");
  }

  const browser = await chromium.launch({ channel: "chrome", headless: !headed });
  const context = await createEbayContext(browser, { storageState });
  const page = await context.newPage();

  let anyBlocked = false;

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await delay(2000);
    const name = queries[i];
    const query = stripParens(name);

    const result = await scrapeSoldListings(page, query);
    logScrapeResult(`${name}`, result);
    if (result.listings.length > 0) {
      console.log(JSON.stringify(result.listings, null, 2));
    }
    if (result.status === "blocked") anyBlocked = true;

    if (dumpDir) {
      await mkdir(dumpDir, { recursive: true });
      const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const htmlPath = join(dumpDir, `${slug}.html`);
      await writeFile(htmlPath, await page.content());
      await writeFile(
        join(dumpDir, `${slug}.meta.json`),
        JSON.stringify(
          { query, ...result, listings: `${result.listings.length} parsed` },
          null,
          2
        )
      );
      console.log(`  Dumped HTML to ${htmlPath}`);
    }
  }

  await browser.close();

  if (anyBlocked) {
    console.error("\nAt least one query hit the eBay sign-in wall");
    process.exit(2);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      state: { type: "string" },
      headed: { type: "boolean", default: false },
      "dump-html": { type: "string" },
    },
  });

  if (command === "login") {
    await login(values.state ?? DEFAULT_STATE_PATH);
  } else if (command === "search") {
    if (positionals.length === 0) {
      console.error('Usage: node scraper/ebay-sandbox.mjs search "<name>" [...]');
      process.exit(1);
    }
    await search(positionals, {
      statePath: values.state,
      headed: values.headed,
      dumpDir: values["dump-html"],
    });
  } else {
    console.error("Usage: node scraper/ebay-sandbox.mjs <login|search> [args]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
