# Scraper scripts

The scripts here run from GitHub Actions against the deployed app's `/api/cron/*` endpoints, authenticated with a `CRON_SECRET` Bearer token. Common env: `API_URL` (default `https://thelensdb.com`), `CRON_SECRET`.

```bash
cd scraper
npm ci
```

- `dpreview-watch-action.mjs` — DPReview new-product watcher, for both lenses and camera bodies. `ENTITY=lenses` (default) scans the lens index and POSTs to `/api/cron/dpreview-lenses` (`.github/workflows/dpreview-new-lenses.yml`, Mondays 09:00 UTC); `ENTITY=cameras` scans the camera index and POSTs to `/api/cron/dpreview-cameras` (`dpreview-new-cameras.yml`, Mondays 10:00 UTC). Env: `PAGES` (index pages to scan, default 1), `LIMIT`.
  Camera product links carry the category segment a body was first filed under — mirrorless and DSLRs alike under `/slrs/`, fixed-lens bodies under `/compacts/`, only the newest under `/cameras/` — so the script matches all three. `/actioncams/` is deliberately not collected (the database holds no GoPro/DJI/Insta360 bodies); the script logs any category segment it does not recognise rather than skipping it silently.
- `dpreview-review-cli.mjs` — interactive CLI for uncertain DPReview duplicate candidates via `/api/cron/dpreview-review` (or `/api/cron/dpreview-camera-review` with `ENTITY=cameras`): mark each as duplicate, new, version-group member (lenses only), or skip. Cameras have no version groups — a successor body is its own record, so answer "new".
- `dpreview-audit-cli.mjs` — LLM audit of DPReview-extracted specs via `/api/cron/dpreview-audit`; writes `dpreview-audit-report.json` in the working directory. Env: `ENTITY` (`lenses` default, `cameras`, or `all`), `LIMIT`, `CREATE_EDITS=1` (file findings as pending edits), `RECENT_HOURS` (only recent candidates; the watcher workflows pass 192), `AFTER_ID` (resume). Also runs as the second step of each watcher workflow.
