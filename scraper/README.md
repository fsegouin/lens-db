# Scraper scripts

The scripts here run against the deployed app's `/api/cron/*` endpoints, authenticated with a `CRON_SECRET` Bearer token. The DPReview watchers run weekly on a self-hosted scheduler, not from GitHub Actions. Common env: `API_URL` (default `https://thelensdb.com`), `CRON_SECRET`.

```bash
cd scraper
npm ci
```

- `dpreview-watch-action.mjs`: DPReview new-product watcher, for both lenses and camera bodies. `ENTITY=lenses` (default) scans the lens index and POSTs to `/api/cron/dpreview-lenses`; `ENTITY=cameras` scans the camera index and POSTs to `/api/cron/dpreview-cameras`. Env: `PAGES` (index pages to scan, default 1), `LIMIT`, `DRY_RUN=1` (read DPReview only: nothing fetched from or sent to the API), `HEADLESS=0` (visible Chrome; under `xvfb-run` where there is no display), `CHROME_PATH` (a Chromium executable instead of Google Chrome), `DEBUG_DIR` (where a failed index page's HTML and screenshot are saved, default `scraper/dpreview-debug/`, gitignored). Every page load is retried up to four times in a fresh browser context; the run exits 1 when index page 1 never loads, when three product pages in a row fail, or when every product fails.
  Camera product links carry the category segment a body was first filed under (mirrorless and DSLRs alike under `/slrs/`, fixed-lens bodies under `/compacts/`, only the newest under `/cameras/`), so the script matches all three. `/actioncams/` is deliberately not collected (the database holds no GoPro/DJI/Insta360 bodies); the script logs any category segment it does not recognise rather than skipping it silently.
- `dpreview-review-cli.mjs`: interactive CLI for uncertain DPReview duplicate candidates via `/api/cron/dpreview-review` (or `/api/cron/dpreview-camera-review` with `ENTITY=cameras`): mark each as duplicate, new, version-group member (lenses only), or skip. Cameras have no version groups: a successor body is its own record, so answer "new".
- `dpreview-audit-cli.mjs`: LLM audit of DPReview-extracted specs via `/api/cron/dpreview-audit`; writes `dpreview-audit-report.json` in the working directory. Env: `ENTITY` (`lenses` default, `cameras`, or `all`), `LIMIT`, `CREATE_EDITS=1` (file findings as pending edits), `RECENT_HOURS` (only recent candidates; the scheduled runs pass 192), `AFTER_ID` (resume). Also runs after each scheduled watcher run.
