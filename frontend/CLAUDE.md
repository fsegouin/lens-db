# Lens DB Frontend

Camera lens database with 7,400+ lenses, 1,000+ cameras, 130+ mount systems, and 50+ curated collections. Built on data from lens-db.com (2012-2025).

## Commands

```bash
pnpm install          # Install dependencies (pnpm enforced via preinstall hook)
pnpm dev              # Start dev server (Next.js)
pnpm db:migrate       # Apply Drizzle migrations (drizzle-kit migrate)
pnpm build            # Production build (runs db:migrate first)
pnpm start            # Start production server
pnpm lint             # ESLint (next/core-web-vitals + typescript)
pnpm test             # node:test suites (src/**/*.test.ts), no database needed
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (via PostCSS plugin, dark mode with `dark:` utilities, zinc palette)
- **Database**: Supabase PostgreSQL via Drizzle ORM (node-postgres driver, through the Supabase transaction pooler)
- **Rate Limiting**: Upstash Redis (sliding window)
- **AI**: Vercel AI SDK via AI Gateway — chat (`/chat`, tools from the `lens-db-mcp-server` workspace package), eBay listing classification, and DPReview import dedupe/audit checks (all `google/gemini-3.1-flash-lite`)
- **Email**: Resend (account verification emails)
- **Image Storage**: Cloudflare R2 (admin uploads, served from R2 public URL)
- **Analytics**: Vercel Analytics + Speed Insights
- **Package Manager**: pnpm (enforced, no npm/yarn)

## Architecture

```
src/
├── proxy.ts                    # Next.js 16 proxy: /admin auth redirect + CSRF Origin check
├── instrumentation-client.ts   # Client init: BotID protection for routes in src/lib/botid.ts
├── hooks/use-entity-search.ts  # Client hook: debounced lens/camera typeahead search
├── app/
│   ├── layout.tsx              # Root layout (nav, footer, theme, analytics)
│   ├── page.tsx                # Home (popular lenses, top comparisons)
│   ├── api/
│   │   ├── auth/               # login, logout, register, me, verify-email
│   │   ├── cameras/route.ts    # GET: search/paginate cameras
│   │   ├── chat/route.ts       # POST: AI chat (streamed, DB tools)
│   │   ├── comparisons/route.ts # GET: top comparisons, POST: record comparison
│   │   ├── cron/               # Cron routes: ebay-prices, ebay-lens-prices, dpreview-lenses, dpreview-review, dpreview-cameras, dpreview-camera-review, dpreview-audit, flush-view-counts, warm-prices
│   │   ├── duplicates/route.ts # POST: flag duplicate entities
│   │   ├── edits/route.ts      # User-submitted edits
│   │   ├── lenses/route.ts     # GET: search/filter/paginate lenses
│   │   ├── ratings/route.ts    # GET/POST/DELETE: lens ratings (1-10, IP-based)
│   │   ├── revisions/          # Revision history
│   │   ├── search/route.ts     # GET: global search
│   │   ├── submissions/route.ts # POST: new entity submissions
│   │   ├── systems/route.ts    # Systems lookup
│   │   ├── views/route.ts      # POST: increment view count
│   │   └── admin/              # Protected admin CRUD API (see Admin Portal below)
│   ├── admin/                  # Admin portal: login + (authenticated) CRUD pages
│   ├── chat/                   # AI chat page
│   ├── lenses/                 # List ([slug] detail, compare, series)
│   ├── cameras/                # List ([...slug] detail — catch-all for nested paths)
│   ├── collections/            # List ([slug] detail with lens table)
│   ├── systems/                # List ([slug] detail with lens + camera tables)
│   ├── search/                 # Global search across lenses, cameras, systems
│   ├── compare/                # Comparison page
│   ├── history/                # Revision history per entity ([entityType]/[entityId])
│   ├── submit/                 # Public submission form
│   ├── login/ register/ verify-email/  # User account pages
│   ├── robots.ts sitemap.ts    # SEO
│   └── opengraph-image.tsx twitter-image.tsx  # Social cards
├── components/
│   ├── CameraList.tsx          # Client: paginated camera table with search
│   ├── LensList.tsx            # Client: paginated lens table with 13+ filters
│   ├── ChatInterface.tsx       # Client: AI chat UI
│   ├── EbayListings.tsx / PriceCard.tsx / PriceChart.tsx  # eBay price display
│   ├── ImageGallery.tsx        # Client: image grid with lightbox
│   ├── RatingWidget.tsx        # Client: 10-star rating with submit/delete
│   ├── SearchInput.tsx / HeaderSearch.tsx  # Debounced search inputs
│   ├── ViewTracker.tsx         # Client: silent view tracking (sessionStorage dedup)
│   ├── theme-provider.tsx / theme-toggle.tsx  # Dark mode (next-themes)
│   ├── admin/                  # Admin components (forms, tables, bulk actions, image upload)
│   └── ui/                     # shadcn-style primitives
├── db/
│   ├── index.ts                # DB singleton (pg Pool + Drizzle, lazy init)
│   ├── pool.ts                 # createPool: tiny pg Pool (max 4) with pinned Supabase CA; also used by mcp-server
│   ├── supabase-ca.ts          # Supabase Root 2021 CA (TLS chain verification)
│   └── schema.ts               # All table definitions and relations
└── lib/
    ├── admin-auth.ts           # Admin helpers on top of user sessions (role checks)
    ├── user-auth.ts            # User accounts: PBKDF2 password hashing, HMAC-signed sessions
    ├── api-utils.ts            # getClientIP, hashIP (SHA-256), rateLimitedResponse
    ├── rate-limit.ts           # Upstash rate limiters (ratings/views/comparisons/search/chat)
    ├── ebay-auth.ts / ebay-search-query.ts / ebay-types.ts  # eBay API integration
    ├── price-classify.ts / price-classify-lens.ts  # LLM listing classification (Gemini)
    ├── price-pipeline.ts / prices.ts  # Price history + estimates
    ├── revisions.ts / apply-correction.ts / edit-validation.ts  # Community edits
    ├── email.ts                # Resend verification emails
    ├── r2-upload.ts            # Cloudflare R2 image uploads (sharp resize)
    ├── images.ts               # getImages: local filesystem → DB fallback
    ├── format-description.ts   # Clean up raw press release descriptions into paragraphs
    └── ...                     # search, redis, view-counts, lens-tags, analytics, botid, utils
```

## Database Schema

Core tables: `systems`, `lenses`, `cameras`, `collections`, `lensSeries`, `tags`, `users`
Junction tables: `lensCollections` (M:N), `lensSeriesMemberships` (M:N), `lensTags` (M:N), `lensCompatibility` (M:N with isNative flag), `lensSystems` (M:N mount availability — the source of truth for "which mounts is this lens sold in"; `lenses.systemId` is the primary mount and is always mirrored into `lensSystems` by a DB trigger, so list/filter/system-page queries read the junction table alone; admin writes go through `lib/lens-systems.ts`)
Systems: one row per physical mount, not per camera family or per-lens variant (a lens's original mount string survives in `lenses.specs.Mount`). `systemRedirects` maps slugs of merged-away systems to their survivor; `/systems/[slug]` follows it on a miss. Merges are done with `scripts/consolidate-systems.mjs` (dry run by default).
Engagement: `lensRatings`, `cameraRatings`, `lensComparisons`, `cameraComparisons`
Community edits: `revisions`, `pendingEdits`, `duplicateFlags`, `issueReports`, `blockedIps`
Accounts: `users`, `emailVerificationTokens`
Prices: `priceEstimates`, `priceHistory` (eBay sold-listing pipeline)
DPReview watcher: `lensVersionGroups` (lens generations via `lenses.versionGroupId`), `dpreviewLensCandidates` and `dpreviewCameraCandidates` (seen-registries, status pending/imported/rejected/matched/review). Cameras have no version-group equivalent: a successor body is its own `cameras` row, so the camera LLM verdict is binary (duplicate / new_camera) where the lens one has three values.

Key relationships:
- `systems` 1→N `lenses`, `systems` 1→N `cameras`
- `lenses` N→N `collections` (via `lensCollections`), N→N `lensSeries`, N→N `tags`
- `lensComparisons`: canonical ordering enforced (`lensId1 < lensId2`)
- `lensRatings`: one rating per IP per lens (unique on `lensId + ipHash`), rating 1-10

Schema location: `src/db/schema.ts`. Drizzle config: `drizzle.config.ts` (output: `./drizzle`). It loads `.env`/`.env.local`, then splits `DATABASE_URL` into host/port/user/password/database and pins the Supabase root CA (`src/db/supabase-ca.ts`) because drizzle-kit cannot verify Supabase's chain from a bare URL.

## Database Migrations

Vercel runs `drizzle-kit migrate` before `next build` (`"build": "pnpm db:migrate && next build"`). `drizzle-kit migrate` only applies files listed in `drizzle/meta/_journal.json` — a `.sql` file that isn't registered there is silently skipped. A past outage came from exactly this: two orphan migration files never ran on prod, and the build broke when queries referenced a column that was never added.

Rules:

- **Always use `drizzle-kit generate` for schema changes.** It writes the SQL, updates `_journal.json`, and creates the matching `meta/NNNN_snapshot.json` atomically. Never hand-drop a `.sql` into `drizzle/`.
- **For data-only migrations**, use `pnpm exec drizzle-kit generate --custom --name <slug>`. This creates an empty registered migration you fill in with custom SQL.
- **Commit the SQL + journal + snapshot together.** If a PR touches `drizzle/*.sql` but not `_journal.json`, something is wrong.
- **Write migrations idempotently** so partial prior states (manual hotfixes, interrupted runs) don't break reruns: `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`, `COALESCE(..., 0)` around scalar subqueries used in arithmetic, name- or id-based `WHERE` clauses that simply match nothing if the target is gone.
- **Never edit a migration that has already shipped.** Add a new one instead — `drizzle-kit migrate` tracks applied migrations by filename hash in `__drizzle_migrations`.

## API Routes & Rate Limits

| Endpoint | Methods | Rate Limit | Purpose |
|----------|---------|------------|---------|
| `/api/lenses` | GET | 20/60s | Search + filter + paginate (13+ params) |
| `/api/cameras` | GET | 20/60s | Search + paginate |
| `/api/search` | GET | 20/60s | Global search |
| `/api/ratings` | GET/POST/DELETE | 10/60s | Per-lens ratings (IP-based identity) |
| `/api/views` | POST | 20/60s | Increment view count (lens/camera/system) |
| `/api/comparisons` | GET/POST | 10/60s | Top comparisons + record new |
| `/api/chat` | POST | 10/60s | AI chat (streamed) |
| `/api/auth/login` | POST | 10/60s | User login |
| `/api/auth/register` | POST | 5/60s | User registration |
| `/api/edits` | POST | 30/3600s (per user) | User-submitted edits |
| `/api/submissions` | POST | 10/3600s | New entity submissions |
| `/api/duplicates` | POST | 10/3600s | Flag duplicates |

`/api/cron/*` routes are protected by `CRON_SECRET` instead of rate limiting (fail-closed: requests are rejected when `CRON_SECRET` is unset).

All API routes return JSON. Error responses: 400 (validation), 401 (auth), 409 (conflict), 429 (rate limit), 500 (server).

## Code Patterns

### Caching & Rendering
- All pages are **async Server Components** (no client-side data fetching for initial render)
- Detail pages and static lists use **ISR** with `revalidate = 604800` (7 days)
- Filter-heavy pages (`/lenses`, `/cameras`, `/search`) are **dynamic** (per-request)
- `unstable_cache` used for dropdown data on `/lenses` (brands + systems, 7-day TTL)

### Pagination
- Cursor-based, 50 items per page, max offset 10,000
- Client components use `IntersectionObserver` (200px margin) for infinite scroll
- API returns `{ items, nextCursor, total }`

### Search
- Regex-based word matching (`src/lib/search.ts`): every query token must match, so more words narrow the result
- Punctuation separates rather than disappears, accents fold to ASCII, and a token starting with a digit may not continue a longer number (`35` misses `135mm`, but `617` finds `GX617`)
- Max 10 search words per query, query trimmed to 200 chars
- Two matchers must agree: `buildNameSearch` (Postgres, used by the list and search pages) and `buildNameMatchers` (in-process, used by the typeahead's cached index). `src/lib/search.test.ts` pins that parity, and `mcp-server/src/search.ts` is a deliberate duplicate kept in sync by the same suite.

### Client Components
- URL-driven state: filters synced to `searchParams` via `router.push`
- Debounced inputs (400ms) for search and filter changes
- Table column headers clickable for sorting; cell values clickable to apply as filters

### Images
- Local images preferred: checks `/public/images/{lenses|cameras}/{slug}/`
- Slug normalization: `/` replaced with `__` in directory names
- Fallback to DB-stored image URLs
- Admin uploads go to Cloudflare R2 (`src/lib/r2-upload.ts`, resized with sharp)
- Remote images: R2 public hostname configured in `next.config.ts` `remotePatterns`

### View Tracking
- `ViewTracker` component deduplicates via `sessionStorage` (once per session per resource)
- Renders null (no visual output)

### Ratings
- IP identified via `x-forwarded-for` → `x-real-ip` → "unknown"
- IP hashed with SHA-256 + salt (`RATE_HASH_SALT` env var)
- Upsert on submit, recalculates average on lens record

## Admin Portal

Role-protected admin at `/admin/*` for CRUD management of all entities. Admins are regular user accounts with role `admin` — there is no separate admin password.

### Auth Flow
- User accounts: PBKDF2 password hashing, email verification via Resend (`src/lib/user-auth.ts`)
- Session: stateless HMAC-signed token (`userId.expiresAt.signature`, signed with `SESSION_SECRET`) in HTTP-only cookie `user_session`, 30-day TTL
- `src/proxy.ts` redirects users without a `user_session` cookie away from `/admin/*` to `/login`; role is validated server-side (`/admin/login` just redirects to `/login`)
- API routes use `requireAdminAPI()` from `src/lib/admin-auth.ts`; pages use `requireAdmin()`
- Login rate limited: 10 req/60s (registration: 5 req/60s)

### Admin Routes
| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard (entity counts) |
| `/admin/{lenses,cameras,systems,collections,series}` | List table → `[id]/edit` form, `new` form |
| `/admin/compatibility` | Lens-camera compatibility (composite key, custom table) |
| `/admin/users` | User management (`[id]` detail page) |
| `/admin/pending-edits` | Review queue for user-submitted edits |
| `/admin/duplicates` | Flagged duplicate entities |
| `/admin/recent-changes` | Recent revision activity |

### Admin API Routes
All under `/api/admin/`, session-protected (role `admin`):
- `GET/POST /api/admin/{lenses,cameras,systems,collections,series}` — list + create
- `GET/PUT/DELETE /api/admin/{lenses,cameras,systems,collections,series}/[id]` — read/update/delete
- `GET/POST/DELETE /api/admin/compatibility` — list/create/delete (composite key in body)
- Plus: `users`, `pending-edits`, `duplicates`, `revisions`, `recent-changes`, `tags`, `blocked-ips`, `price-classify`, `login`, `logout`

### Admin Components
- `AdminTable` — reusable searchable/paginated table with column config
- Entity forms (`LensForm`, `CameraForm`, `SystemForm`, `CollectionForm`, `SeriesForm`) — create/edit with auto-slug generation, validation, delete with confirmation
- `BulkLensActions` / `BulkCameraActions` — bulk operations on list pages
- `CollectionLensManager` / `SeriesLensManager` — add/remove lenses via search
- `CompatibilityForm` — lens/camera typeahead search to create compatibility entries
- `ImageUploader` — upload images to R2
- `ReportPanel` / `EditPageWithReport` — review user-submitted edits

## Environment Variables

```bash
DATABASE_URL=          # Supabase pooler connection string (required)
SESSION_SECRET=        # HMAC key for signing session tokens (required)
RATE_HASH_SALT=        # SHA-256 salt for IP hashing (required for ratings)
KV_REST_API_URL=       # Upstash Redis URL (required for rate limiting)
KV_REST_API_TOKEN=     # Upstash Redis token (required for rate limiting)
RESEND_API_KEY=        # Resend API key (verification emails)
RESEND_FROM_EMAIL=     # From address for emails
APP_URL=               # Base URL for email links
AI_GATEWAY_API_KEY=    # Vercel AI Gateway key (/chat, price classification, DPReview dedupe/audit)
CRON_SECRET=           # Bearer token protecting /api/cron/* endpoints
EBAY_APP_ID=           # eBay API credentials (price pipeline)
EBAY_CERT_ID=
EBAY_CAMPAIGN_ID=      # eBay Partner Network campaign (affiliate links)
R2_ACCOUNT_ID=         # Cloudflare R2 (admin image uploads)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

See `.env.example` for details. All env files are gitignored.

## Gotchas

- **pnpm only**: `preinstall` script rejects npm/yarn — always use `pnpm`
- **Camera catch-all slug**: `/cameras/[...slug]` supports multi-segment paths (slugs with `/` in them)
- **Comparison ordering**: `lensComparisons` enforces `lensId1 < lensId2` — always pass the smaller ID first
- **Local images gitignored**: `/public/images/lenses/` and `/public/images/cameras/` are in `.gitignore` — they come from a separate scraper
- **Security headers**: Comprehensive headers set in `next.config.ts` (HSTS, X-Frame-Options DENY, CSP-adjacent)
- **Raw specs JSON**: Hidden in production on camera detail pages (dev-only debug display)
- **Path alias**: `@/*` maps to `./src/*`
- **Sessions are stateless**: HMAC-signed tokens validated with `SESSION_SECRET` — no server-side session store; rotating the secret invalidates all sessions
- **Next.js 16 proxy (not middleware)**: In Next.js 16, `middleware.ts` is replaced by `proxy.ts`. Always use `src/proxy.ts` — never create `middleware.ts`
- **Admin proxy**: `src/proxy.ts` only checks cookie existence (and enforces CSRF Origin checks on mutating `/api/*` requests); full session + role validation happens in API routes and page helpers
- **Rate limiting off in dev**: limiters are no-ops when `NODE_ENV=development` (`src/lib/redis.ts` returns null)

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
