# Lens DB Frontend

Camera lens database with 7,400+ lenses, 1,000+ cameras, 130+ mount systems, and 50+ curated collections. Built on data from lens-db.com (2012-2025).

## Commands

```bash
pnpm install          # Install dependencies (pnpm enforced via preinstall hook)
pnpm dev              # Start dev server (Next.js)
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # ESLint (next/core-web-vitals + typescript)
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (via PostCSS plugin, dark mode with `dark:` utilities, zinc palette)
- **Database**: Neon serverless PostgreSQL via Drizzle ORM
- **Rate Limiting**: Upstash Redis (sliding window)
- **Analytics**: Vercel Analytics
- **Package Manager**: pnpm (enforced, no npm/yarn)

## Architecture

```
src/
├── app/
│   ├── layout.tsx              # Root layout (nav, footer, analytics)
│   ├── page.tsx                # Home (popular lenses, top comparisons)
│   ├── api/
│   │   ├── cameras/route.ts    # GET: search/paginate cameras
│   │   ├── comparisons/route.ts # GET: top comparisons, POST: record comparison
│   │   ├── lenses/route.ts     # GET: search/filter/paginate lenses
│   │   ├── ratings/route.ts    # GET/POST/DELETE: lens ratings (1-10, IP-based)
│   │   ├── views/route.ts      # POST: increment view count
│   │   └── admin/              # Protected admin CRUD API (see Admin Portal below)
│   ├── admin/                  # Admin portal (login, dashboard, CRUD pages)
│   ├── lenses/                 # List ([slug] detail, compare)
│   ├── cameras/                # List ([...slug] detail — catch-all for nested paths)
│   ├── collections/            # List ([slug] detail with lens table)
│   ├── systems/                # List ([slug] detail with lens + camera tables)
│   └── search/                 # Global search across lenses, cameras, systems
├── components/
│   ├── CameraList.tsx          # Client: paginated camera table with search
│   ├── LensList.tsx            # Client: paginated lens table with 13+ filters
│   ├── CompareClient.tsx       # Client: side-by-side lens comparison
│   ├── ImageGallery.tsx        # Client: image grid with lightbox
│   ├── RatingWidget.tsx        # Client: 10-star rating with submit/delete
│   ├── SearchInput.tsx         # Client: debounced search input
│   ├── ViewTracker.tsx         # Client: silent view tracking (sessionStorage dedup)
│   └── admin/                  # Admin components (forms, table, logout button)
├── db/
│   ├── index.ts                # DB singleton (Neon + Drizzle, lazy init)
│   └── schema.ts               # All table definitions and relations
└── lib/
    ├── admin-auth.ts           # Admin auth: session management, password verification
    ├── api-utils.ts            # getClientIP, hashIP (SHA-256), rateLimitedResponse
    ├── format-description.ts   # Clean up raw press release descriptions into paragraphs
    ├── images.ts               # getImages: local filesystem → DB fallback
    └── rate-limit.ts           # Upstash rate limiters (ratings/views/comparisons/search)
```

## Database Schema

Core tables: `systems`, `lenses`, `cameras`, `collections`
Junction tables: `lensCollections` (M:N), `lensCompatibility` (M:N with isNative flag), `lensRatings`, `lensComparisons`

Key relationships:
- `systems` 1→N `lenses`, `systems` 1→N `cameras`
- `lenses` N→N `collections` (via `lensCollections`)
- `lensComparisons`: canonical ordering enforced (`lensId1 < lensId2`)
- `lensRatings`: one rating per IP per lens (unique on `lensId + ipHash`), rating 1-10

Schema location: `src/db/schema.ts`. Drizzle config: `drizzle.config.ts` (output: `./drizzle`).

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
| `/api/ratings` | GET/POST/DELETE | 10/60s | Per-lens ratings (IP-based identity) |
| `/api/views` | POST | 20/60s | Increment view count (lens/camera/system) |
| `/api/comparisons` | GET/POST | 10/60s | Top comparisons + record new |

All API routes return JSON. Error responses: 400 (validation), 429 (rate limit), 500 (server).

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
- Regex-based word matching: query split into words, each wrapped in word boundaries
- Punctuation stripped before matching
- Max 10 search words per query, query trimmed to 100 chars
- Lenses: regex matching on name. Cameras: simple `ilike`. Search page: `ilike` across all tables.

### Client Components
- URL-driven state: filters synced to `searchParams` via `router.push`
- Debounced inputs (400ms) for search and filter changes
- Table column headers clickable for sorting; cell values clickable to apply as filters

### Images
- Local images preferred: checks `/public/images/{lenses|cameras}/{slug}/`
- Slug normalization: `/` replaced with `__` in directory names
- Fallback to DB-stored image URLs
- Whitelist: only `/images/` paths and `https://web.archive.org/` URLs allowed
- Remote images: `web.archive.org` configured in `next.config.ts`

### View Tracking
- `ViewTracker` component deduplicates via `sessionStorage` (once per session per resource)
- Renders null (no visual output)

### Ratings
- IP identified via `x-forwarded-for` → `x-real-ip` → "unknown"
- IP hashed with SHA-256 + salt (`RATE_HASH_SALT` env var)
- Upsert on submit, recalculates average on lens record

## Admin Portal

Password-protected admin at `/admin/*` for CRUD management of all entities.

### Auth Flow
- `ADMIN_PASSWORD` env var compared via SHA-256 constant-time comparison
- Session: random token in HTTP-only cookie (`admin_session`), in-memory store with 24h TTL
- `src/proxy.ts` redirects unauthenticated users to `/admin/login` (except login page itself)
- API routes use `requireAdminAPI()` from `src/lib/admin-auth.ts`
- Login rate limited: 5 req/60s

### Admin Routes
| Route | Purpose |
|-------|---------|
| `/admin/login` | Login page |
| `/admin` | Dashboard (entity counts) |
| `/admin/{lenses,cameras,systems,collections}` | List table → `[id]/edit` form, `new` form |
| `/admin/compatibility` | Lens-camera compatibility (composite key, custom table) |

### Admin API Routes
All under `/api/admin/`, session-protected:
- `GET/POST /api/admin/{lenses,cameras,systems,collections}` — list + create
- `GET/PUT/DELETE /api/admin/{lenses,cameras,systems,collections}/[id]` — read/update/delete
- `GET/POST/DELETE /api/admin/compatibility` — list/create/delete (composite key in body)

### Admin Components
- `AdminTable` — reusable searchable/paginated table with column config
- `AdminForm` per entity — create/edit forms with auto-slug generation, JSON field validation, delete with confirmation
- `CollectionLensManager` — add/remove lenses from a collection via search
- `CompatibilityForm` — lens/camera typeahead search to create compatibility entries

## Environment Variables

```bash
DATABASE_URL=          # Neon PostgreSQL connection string (required)
RATE_HASH_SALT=        # SHA-256 salt for IP hashing (required for ratings)
KV_REST_API_URL=       # Upstash Redis URL (required for rate limiting)
KV_REST_API_TOKEN=     # Upstash Redis token (required for rate limiting)
ADMIN_PASSWORD=        # Admin portal password (required for /admin access)
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
- **Admin sessions**: in-memory store — sessions lost on Vercel cold starts (re-login required, acceptable for single-admin)
- **Next.js 16 proxy (not middleware)**: In Next.js 16, `middleware.ts` is replaced by `proxy.ts`. Always use `src/proxy.ts` — never create `middleware.ts`
- **Admin proxy**: `src/proxy.ts` only checks cookie existence; full session validation happens in API routes and page helpers

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
