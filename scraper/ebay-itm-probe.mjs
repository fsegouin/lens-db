/**
 * Can a GitHub runner read eBay listing pages the way the resolve pass does?
 *
 * The sold-search scraper was walled off in July 2026 from these same runners.
 * Listing pages (/itm/<id>) are the one place eBay says whether an ended
 * listing sold or was pulled by its seller, which the Browse API does not, so
 * whether they load from here decides whether the pipeline can check its own
 * sales. From a home connection they load once the session has a cookie.
 *
 * Reads through the same reader the pipeline uses (lib/ebay-reader.mjs), with
 * the same number of sessions at once, because the pipeline's first runs with
 * several sessions lost the whole Chrome process about 20 seconds into the
 * first batch, on a runner, and never on a Mac. Each reader gets its own
 * Chrome process (PROBE_SHARED=1 puts them all on one, the shape that died):
 * one browser reading one page at a time is the shape that read 800 pages
 * on 2026-09-12 without incident, and separate processes share nothing but
 * the machine. Loads a fixed set of listings whose outcome is already known
 * (read from a home connection on 2026-09-12), twice over, so a block that
 * only starts after some volume shows up too. Prints one line per page and a
 * tally, and always exits 0: the log is the result.
 *
 * Usage: node scraper/ebay-itm-probe.mjs
 * Env: PROBE_READERS (sessions at once, default 4), PROBE_SHARED (1 for one
 * Chrome process shared by every reader).
 */

import { chromium } from "playwright-core";
import { createReader } from "./lib/ebay-reader.mjs";

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

const READERS = Math.max(1, Number(process.env.PROBE_READERS) || 4);
const SHARED = process.env.PROBE_SHARED === "1";

const expected = new Map(
  Object.entries(KNOWN).flatMap(([outcome, ids]) => ids.map((id) => [id, outcome])),
);
const ids = [...expected.keys(), ...expected.keys()];

const tally = { match: 0, blocked: 0, unread: 0, mismatch: 0, chromeGone: 0 };
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

/**
 * Launch one Chrome and report when it goes away. Chrome logs a failed
 * assertion to a file in its profile directory unless told to use stderr,
 * and on the runner the profile is gone with the process; with
 * DEBUG=pw:browser set, Playwright relays stderr into the run log.
 */
async function launch(label) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-logging=stderr", "--v=0", "--disable-audio-output"],
  });
  const state = { browser, gone: false, closing: false, died: false };
  browser.on("disconnected", () => {
    state.gone = true;
    if (state.closing) return;
    state.died = true;
    console.error(`${elapsed()} ${label}: Chrome exited or crashed`);
  });
  return state;
}

const browsers = [];
try {
  const readers = [];
  for (let i = 0; i < READERS; i++) {
    const state = SHARED && browsers[0] ? browsers[0] : await launch(SHARED ? "browser" : `browser ${i + 1}`);
    if (!browsers.includes(state)) browsers.push(state);
    readers.push(await createReader(state.browser, `reader ${i + 1}`, { browserGone: () => state.gone }));
  }
  await Promise.all(readers.map((reader) => reader.warm()));
  console.log(`${elapsed()} warmed ${READERS} readers on ${browsers.length} Chrome process(es)`);

  let next = 0;
  await Promise.all(
    readers.map(async (reader, k) => {
      for (let i = next++; i < ids.length; i = next++) {
        const id = ids[i];
        const want = expected.get(id);
        let read;
        try {
          read = await reader.readPage(id);
        } catch (err) {
          tally.chromeGone++;
          console.log(`${elapsed()} reader ${k + 1} ${id}: ${err.message.split("\n")[0]}`);
          return;
        }
        // The pipeline treats a live listing as "no banner", so a live page
        // that reads null is the expected result.
        const verdict =
          read === want || (want === "live" && read === null) ? "match"
            : read === "blocked" ? "blocked"
              : read == null ? "unread" : "mismatch";
        tally[verdict]++;
        console.log(`${elapsed()} reader ${k + 1} ${id} want ${want} read ${read ?? "-"} ${verdict}`);
      }
    }),
  );
} finally {
  for (const state of browsers) {
    state.closing = true;
    await state.browser.close().catch(() => {});
  }
}

console.log(
  `\nTALLY ${JSON.stringify(tally)} of ${ids.length} page loads, ${READERS} readers, ` +
    `${browsers.length} Chrome process(es), ${browsers.filter((b) => b.died).length} died`,
);
