The harness blocked writing `report-seo.md` ("subagents should return findings as text"), so the full report follows the summary below verbatim — the caller can save it to `/Users/florentsegouin/.claude/jobs/881188ac/tmp/report-seo.md` as-is.

> **CORRECTION (from the site owner, 2026-09-02):** the audit machine's IP has a dedicated Vercel firewall bypass rule, so every live probe below returned 200 regardless of the challenge-all rule. The "challenge-all was not in force" statements in this report are an artefact of that bypass. **Challenge-all IS in force for everyone else**, so the blocked-crawler analysis in §9 describes the actual production behaviour, not a hypothetical. Cache-control / x-vercel-cache observations are unaffected (they come from Next.js, not the firewall).

## Summary (~300 words)

**Top findings, in order of leverage:**

1. **Entity pages are not ISR-cached.** `frontend/src/components/EbayListings.tsx:144` calls `await headers()`, which forces every lens/camera route dynamic; live `/lenses/*` returns `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS` (home page is `HIT`). The `revalidate = 604800` exports are dead. This, not AI bots, is why crawls hit Postgres. Fix: client-side eBay fetch, or `cacheComponents` + `"use cache"`.
2. **The "challenge-all" rule was not in force at audit time** — from a residential IP, curl with GPTBot/ClaudeBot/PerplexityBot/Slackbot/plain-curl UAs all got `200` + full HTML. If re-enabled as described, it blocks all AI crawlers, DuckDuckBot, Applebot, every link unfurler, Search Console URL Inspection and PageSpeed Insights (UA isn't "Googlebot"). Recommendation: replace the custom catch-all with Vercel's **managed Bot Protection ruleset** (auto-exempts verified bots — GPTBot, OAI-SearchBot, ClaudeBot, Claude-User, PerplexityBot, DuckDuckBot, Applebot, Amazonbot, CCBot, Slackbot, Twitterbot, LinkedInBot are all in its directory) plus explicit ASN+UA bypasses for Meta/WhatsApp (AS32934), Discord (AS396982), Telegram (AS62014/62041), Internet Archive (AS7941), Wikimedia (AS14907) and Google tools (AS15169 + Chrome-Lighthouse/Google-InspectionTool). Full rule table in §9.
3. **Zero structured data, zero canonicals, zero per-page descriptions, one global OG image** for 12,076 pages. Proposed JSON-LD graphs (Product + additionalProperty + AggregateRating on a 10-scale + AggregateOffer + `isAccessoryOrSparePartFor` cameras + BreadcrumbList; CollectionPage/ItemList for hubs) in §3.
4. **`PageTransition` ships every page as `<div style="opacity:0">`** in SSR HTML (verified live) — LCP waits for hydration + 250 ms.
5. **No brand pages**; comparisons are query-string, client-only and uncrawlable; lens pages link to `/lenses?brand=` filters rather than `/systems/[slug]`, series, collections or compatible cameras; no breadcrumb; list pages expose 50 anchors and infinite-scroll the rest; system pages cap at 500 rows.
6. URL hygiene: 2,179/2,187 camera URLs carry a redundant `/cameras/camera/` segment; merged-entity and `systemRedirects` redirects are 307 (`redirect()`), not 308; `/search` and `/compare` are in the sitemap with no noindex; single 1.77 MB sitemap, no `lastmod` (no `updatedAt` column exists).
7. AEO: no `llms.txt` (404), MCP server is stdio-only, API is robots-disallowed and undocumented, no dataset, counts differ between home (7,400+), OG image (7,800+) and sitemap (9,576).

Backlinks/mentions: only the homepage surfaced; no third-party references found.

---

# thelensdb.com — Technical SEO & Answer-Engine (AEO) Audit

Audited 2026-09-02 from the `worktree-systems-cleanup` checkout (`frontend/`, Next.js 16.2.10) plus live probes of https://thelensdb.com. Read-only; no repo files were changed. Paths are relative to `/Users/florentsegouin/Work/lens-db/.claude/worktrees/systems-cleanup/frontend/` unless absolute.

## Executive summary

1. **Crawlable but semantically empty for machines.** Zero JSON-LD (`grep -rn "ld+json\|schema.org" src` → nothing), no canonicals, no per-page descriptions, one global OG image for 12k pages.
2. **Entity pages are not actually ISR-cached.** `src/components/EbayListings.tsx:144` `await headers()` opts the whole lens/camera route into dynamic rendering. Live: `private, no-cache, no-store`, `MISS`, also for 404s. Highest-leverage fix for both DB load and SEO.
3. **"Challenge-all" was not in force at audit time** (all bot UAs got 200 from a residential IP). If re-enabled as described, it blocks every AI crawler, DuckDuckGo, Apple, all unfurlers, Search Console inspection and PageSpeed. §9 has the replacement rule set.
4. **Every page ships hidden**: `src/components/page-transition.tsx:7-11` wraps content in `<div style="opacity:0">` (verified in live HTML).
5. **No brand pages** — `lenses.brand` is indexed (`idx_lenses_brand`) but only surfaces as `/lenses?brand=X`, dynamic and unlisted.
6. **Comparisons invisible**: `/compare?type=lens&item1=&item2=` is a client-only fetch (`src/app/compare/CompareClient.tsx:293-324`); the homepage links to these (`src/app/page.tsx:191`).
7. **Thin internal linking**: lens badges link to filters (`src/app/lenses/[slug]/page.tsx:168-213`), never to `/systems/[slug]`, series, collections or cameras; no breadcrumb (`BackButton`, `:161`); camera system badge unlinked (`src/app/cameras/[...slug]/page.tsx:108`); infinite scroll with no `?cursor=` anchors; system tables capped at 500 (`src/app/systems/[slug]/page.tsx:81,88`).
8. **URL hygiene**: `/cameras/camera/` segment on 2,179 URLs; 307s at `lenses/[slug]/page.tsx:57`, `cameras/[...slug]/page.tsx:54`, `systems/[slug]/page.tsx:66`, `lenses/compare/page.tsx:16`; `/search`, `/compare` in sitemap (`src/app/sitemap.ts:40-41`); one 1.77 MB sitemap, 12,076 URLs, no `lastmod`.
9. **AEO surface nil**: no `llms.txt`, robots `Disallow: /api/`, MCP stdio-only (`mcp-server/src/server.ts:97`), no dataset, no quotable lead sentence, h1 → h3 skips h2.
10. **Fact inconsistency**: home 7,400+/1,000+/130+ (`src/app/page.tsx:20-53`), OG image 7,800+/1,700+/220+ (`src/app/opengraph-image.tsx:88`), live sitemap 9,576/2,187/132.

## 1. Sitemap & robots (`src/app/sitemap.ts`, `src/app/robots.ts`)

| Aspect | Finding | Evidence |
|---|---|---|
| Included | static pages incl. `/compare`, `/search`; all non-merged lenses/cameras; systems, collections, series | `sitemap.ts:33-42, 47-75` |
| Live | **12,076 `<url>`**, 1,767,871 bytes, single file: 9,576 lenses, 2,187 cameras, 132 systems, 50 collections, 124 series | `curl /sitemap.xml` |
| `lastmod` | none (0/12,076). Google uses `lastmod` for recrawl priority and ignores changefreq/priority. No `updatedAt` column on lenses/cameras (only `createdAt`, `src/db/schema.ts`); revisions table could supply it. | `sitemap.ts:47-75` |
| Split | not split; use `generateSitemaps()` → per-type files + index for Search Console coverage per type | |
| Wrong | `/search`, `/compare` listed as canonical | `:40-41` |
| Missing | brand pages (don't exist), comparison pages (not static), images sitemap | |
| Cache | `unstable_cache` 7 d, tag `lenses` — good | `:7-27` |
| robots | `Allow /`, `Disallow /admin/ /api/`, sitemap. Live matches. Consider disallowing `/compare?*`, `/search?*`, `/lenses?*` once static hubs exist. | `robots.ts:3-12` |

## 2. Metadata

Root (`src/app/layout.tsx:20-41`): static title, global description, `metadataBase`, Google verification, OG `website`, Twitter card. No `title.template`, no `alternates.canonical`, no `robots`.

Every dynamic route returns **title only**: `lenses/[slug]/page.tsx:28-39`, `cameras/[...slug]/page.tsx:23-35`, `systems/[slug]/page.tsx:27-42`, `collections/[slug]/page.tsx:26-41`, `lenses/series/[slug]/page.tsx:26-41`. `/compare` (`compare/page.tsx:6-9`) and `/search` (`search/page.tsx:60-63`) are static metadata with no noindex; `/search?q=` URLs are self-linked (`:186`) and cached 1 h (`:57`) → indexable thin pages. `/lenses?brand=…` etc. are linked from every lens page, dynamic (`no-store` live), indexable duplicates. `/history/[type]/[id]` (`history/.../page.tsx:52-63`) and `/chat` should be noindex.

Live lens page: description = global; `og:title` = "The Lens DB - Camera Lens Database"; `og:image` = global `/opengraph-image`; no canonical; no robots meta.

OG image: `src/app/opengraph-image.tsx` is one global PNG; `twitter-image.tsx` re-exports it. No per-entity `opengraph-image.tsx`.

Proposed `generateMetadata` for lenses:

```ts
const fl = focal(lens); // "40mm" | "24-70mm"
const desc = `${lens.name}: ${fl} f/${lens.apertureMin} ${lens.isPrime ? "prime" : "zoom"} for ${system?.name ?? lens.brand}` +
  (lens.yearIntroduced ? `, introduced ${lens.yearIntroduced}` : "") +
  (lens.weightG ? `. ${lens.weightG} g` : "") +
  (lens.filterSizeMm ? `, ${lens.filterSizeMm} mm filter` : "") +
  (lens.lensElements ? `, ${lens.lensElements} elements in ${lens.lensGroups} groups` : "") +
  `. Full specs, compatible cameras, price history and user ratings.`;
return {
  title: `${lens.name} specs, price & compatibility`,   // layout template adds " | The Lens DB"
  description: desc.slice(0, 158),
  alternates: { canonical: `/lenses/${lens.slug}` },
  openGraph: { type: "website", title: lens.name, description: desc, url: `/lenses/${lens.slug}` },
  twitter: { card: "summary_large_image", title: lens.name, description: desc },
};
```
Add `title: { default: "The Lens DB — Camera Lens Database", template: "%s | The Lens DB" }` in `layout.tsx`.

## 3. Structured data

Current: none (code grep and live HTML both 0). Available columns: name, slug, brand, description, focal/aperture min/max, weight, filter, MFD, magnification, elements/groups, blades, years, AF/IS/zoom/macro/prime, coverage, `averageRating` (**0–10 scale**, `page.tsx:172`), `ratingCount`, `specs` JSONB, `images[]`, `versionGroupId`, `lensSystems`, `priceEstimates`, `priceHistory`.

### 3a. Lens page

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#product",
      "name": "7Artisans AF 40mm F2.5",
      "url": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5",
      "image": ["https://pub-452f…r2.dev/lenses/7artisans-af-40mm-f2-5/1.jpg"],
      "description": "40mm f/2.5 autofocus prime for Sony E, Nikon Z and Leica L …",
      "brand": { "@type": "Brand", "name": "7Artisans", "url": "https://thelensdb.com/brands/7artisans" },
      "category": "Camera Lenses > Prime Lenses",
      "sku": "7artisans-af-40mm-f2-5",
      "productionDate": "2024",
      "weight": { "@type": "QuantitativeValue", "value": 190, "unitCode": "GRM" },
      "additionalProperty": [
        { "@type": "PropertyValue", "name": "Focal length", "value": 40, "unitCode": "MMT" },
        { "@type": "PropertyValue", "name": "Maximum aperture", "value": "f/2.5" },
        { "@type": "PropertyValue", "name": "Minimum aperture", "value": "f/16" },
        { "@type": "PropertyValue", "name": "Lens mount", "value": "Sony E; Nikon Z; Leica L" },
        { "@type": "PropertyValue", "name": "Image coverage", "value": "Full frame" },
        { "@type": "PropertyValue", "name": "Optical construction", "value": "6 elements in 5 groups" },
        { "@type": "PropertyValue", "name": "Diaphragm blades", "value": 7 },
        { "@type": "PropertyValue", "name": "Minimum focus distance", "value": 0.4, "unitCode": "MTR" },
        { "@type": "PropertyValue", "name": "Maximum magnification", "value": "1:8.3" },
        { "@type": "PropertyValue", "name": "Filter thread", "value": 52, "unitCode": "MMT" },
        { "@type": "PropertyValue", "name": "Autofocus", "value": true },
        { "@type": "PropertyValue", "name": "Image stabilization", "value": false },
        { "@type": "PropertyValue", "name": "Production status", "value": "In production" }
      ],
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": 8.4, "bestRating": 10, "worstRating": 1, "ratingCount": 27 },
      "offers": {
        "@type": "AggregateOffer", "priceCurrency": "USD", "lowPrice": 120, "highPrice": 180, "offerCount": 14,
        "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/UsedCondition",
        "url": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#prices",
        "seller": { "@type": "Organization", "name": "eBay" }
      },
      "isAccessoryOrSparePartFor": [
        { "@type": "Product", "name": "Sony a7 IV", "url": "https://thelensdb.com/cameras/sony-a7-iv" },
        { "@type": "Product", "name": "Nikon Z6 III", "url": "https://thelensdb.com/cameras/nikon-z6-iii" }
      ],
      "isSimilarTo": [{ "@type": "Product", "name": "7Artisans 40mm f/2.5 (manual focus)", "url": "https://thelensdb.com/lenses/7artisans-40mm-f25" }],
      "isRelatedTo": [{ "@type": "Product", "name": "7Artisans AF 35mm F1.8 Lite", "url": "https://thelensdb.com/lenses/7artisans-af-35mm-f18-lite-2026" }],
      "subjectOf": { "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#webpage" }
    },
    {
      "@type": "WebPage",
      "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#webpage",
      "url": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5",
      "name": "7Artisans AF 40mm F2.5 specs, price & compatibility",
      "dateModified": "2026-08-30",
      "isPartOf": { "@id": "https://thelensdb.com/#website" },
      "breadcrumb": { "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#breadcrumb" },
      "mainEntity": { "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#product" }
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://thelensdb.com/lenses/7artisans-af-40mm-f2-5#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Lenses", "item": "https://thelensdb.com/lenses" },
        { "@type": "ListItem", "position": 2, "name": "7Artisans", "item": "https://thelensdb.com/brands/7artisans" },
        { "@type": "ListItem", "position": 3, "name": "Sony E", "item": "https://thelensdb.com/systems/sony-e" },
        { "@type": "ListItem", "position": 4, "name": "7Artisans AF 40mm F2.5" }
      ]
    }
  ]
}
```
Notes: `isAccessoryOrSparePartFor` is the correct lens→camera property (cap ~20 most-viewed cameras); `isSimilarTo` = `versionGroupId` siblings; `isRelatedTo` = same series. Declare `bestRating: 10` or Google assumes 5. Offers caveat: `AggregateOffer` from eBay estimates is defensible (real listings, `offerCount` from the scrape, Used) but Google's merchant policy expects the page to offer the product; don't claim `InStock` unless the last scrape saw live listings — or drop `offers` and use `additionalProperty "Typical used price (eBay, 90-day)": "$120–180"`. Emit non-null fields only; `specs` JSONB can add 10–30 more `PropertyValue`s. Add `WebSite`+`SearchAction` and `Organization` on home.

### 3b. Camera page

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://thelensdb.com/cameras/canon-eos-r6-mark-iii#product",
      "name": "Canon EOS R6 Mark III", "alternateName": ["EOS R6 III"],
      "url": "https://thelensdb.com/cameras/canon-eos-r6-mark-iii",
      "image": ["…"],
      "description": "Full-frame 32.5 MP mirrorless camera with Canon RF mount, introduced 2025 …",
      "brand": { "@type": "Brand", "name": "Canon", "url": "https://thelensdb.com/brands/canon" },
      "category": "Cameras > Mirrorless", "productionDate": "2025",
      "weight": { "@type": "QuantitativeValue", "value": 699, "unitCode": "GRM" },
      "additionalProperty": [
        { "@type": "PropertyValue", "name": "Lens mount", "value": "Canon RF" },
        { "@type": "PropertyValue", "name": "Sensor", "value": "Full frame CMOS, 36×24 mm" },
        { "@type": "PropertyValue", "name": "Effective resolution", "value": 32.5, "unitText": "MP" },
        { "@type": "PropertyValue", "name": "Body type", "value": "Mirrorless" },
        { "@type": "PropertyValue", "name": "In-body stabilization", "value": "Yes, 5-axis" },
        { "@type": "PropertyValue", "name": "ISO range", "value": "100–102400" }
      ],
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": 8.9, "bestRating": 10, "ratingCount": 12 },
      "offers": { "@type": "AggregateOffer", "priceCurrency": "USD", "lowPrice": 2100, "highPrice": 2500, "offerCount": 9, "itemCondition": "https://schema.org/UsedCondition" },
      "isRelatedTo": { "@type": "ItemList", "name": "Lenses for the Canon RF mount", "url": "https://thelensdb.com/cameras/canon-eos-r6-mark-iii/lenses", "numberOfItems": 84 }
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Cameras", "item": "https://thelensdb.com/cameras" },
      { "@type": "ListItem", "position": 2, "name": "Canon", "item": "https://thelensdb.com/brands/canon" },
      { "@type": "ListItem", "position": 3, "name": "Canon RF", "item": "https://thelensdb.com/systems/canon-rf" },
      { "@type": "ListItem", "position": 4, "name": "Canon EOS R6 Mark III" } ] }
  ]
}
```

### 3c. System / brand / collection / series

```json
{
  "@context": "https://schema.org",
  "@graph": [{
    "@type": "CollectionPage",
    "@id": "https://thelensdb.com/systems/sony-e#page",
    "url": "https://thelensdb.com/systems/sony-e",
    "name": "Sony E-mount lenses and cameras",
    "description": "Every lens (412) and camera body (58) made for the Sony E mount, with specs, release years and used prices.",
    "about": { "@type": "Thing", "name": "Sony E-mount", "sameAs": "https://www.wikidata.org/wiki/Q1189962" },
    "mainEntity": {
      "@type": "ItemList", "name": "Sony E-mount lenses", "numberOfItems": 412, "itemListOrder": "https://schema.org/ItemListOrderAscending",
      "itemListElement": [{ "@type": "ListItem", "position": 1, "url": "https://thelensdb.com/lenses/sony-fe-24-70mm-f28-gm-ii", "name": "Sony FE 24-70mm F2.8 GM II" }]
    },
    "breadcrumb": { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Systems", "item": "https://thelensdb.com/systems" },
      { "@type": "ListItem", "position": 2, "name": "Sony E" } ] }
  }]
}
```
Brand page: same shape with `"about": { "@type": "Brand", "name": "Sigma", "sameAs": ["https://www.wikidata.org/wiki/Q1145211", "https://www.sigma-global.com/"] }`. Wikidata `sameAs` is the cheapest entity-linking win (mounts, brands, famous lenses all have Q-ids). `FAQPage` only with real Q&A (e.g. coverage questions). Implement via a shared `lib/jsonld.ts`, one `<script type="application/ld+json">` per page with `</script>` escaping.

## 4. URL architecture

| Pattern | Status | Notes |
|---|---|---|
| `/lenses/[slug]` | fine | |
| `/cameras/[...slug]` | problem | 2,179/2,187 live URLs are `/cameras/camera/<name>` (scrape residue); `lib/images.ts:15` maps "/" → `__`. Move to `/cameras/<name>` with 308. |
| `/systems/[slug]` | fine | 132 systems; 16 legacy slugs 308 via `next.config.ts:34-54` (verified `/systems/canon-eos` → 308). DB `systemRedirects` fallback uses `redirect()` = 307 (`systems/[slug]/page.tsx:66`) → use `permanentRedirect()`. |
| Merged lens/camera | 307 | `lenses/[slug]/page.tsx:57`, `cameras/[...slug]/page.tsx:54` |
| `/lenses/compare` | 307 → `/compare` | `lenses/compare/page.tsx:16`; still linked from hero `page.tsx:114` |
| `/compare?type=&item1=&item2=` | uncrawlable | client-only fetch |
| `/collections/[slug]`, `/lenses/series/[slug]` | fine | `generateStaticParams` in prod |
| `/brands/[brand]` | **missing** | brand list derivable today from `selectDistinct(lenses.brand)` (`lenses/page.tsx:12-16`) |
| `/lenses?brand=…` | indexable duplicates | linked from every lens page, dynamic, `no-store` |
| `/history/[type]/[id]` | should be noindex | 12k thin pages |

Proposed URL map:

| Route | Rationale | ~Pages |
|---|---|---|
| `/brands/[brand]` | head terms ("Canon lenses"), brand entity, breadcrumb anchor, Wikidata `sameAs` | ~120 |
| `/brands/[brand]/lenses`, `/cameras` | paginated static lists replacing `/lenses?brand=` | ~200+ |
| `/cameras/[slug]` (drop `/camera/`) | clean URL, 308 from old | 2,187 |
| `/cameras/[slug]/lenses` | "lenses for the Sony a6400" — largest long-tail intent; from `systemId` + `lensSystems` + coverage | ~1,700 |
| `/lenses/[slug]/cameras` | inverse; start as on-page section | 0–7k |
| `/systems/[slug]/lenses`, `/cameras` | paginated; lifts the 500-row cap | ~300 |
| `/systems/[slug]/lenses/[facet]` (primes, zooms, macro, wide-angle, standard, telephoto, portrait, fast, pancake, stabilized, autofocus, manual-focus) | mid-tail hubs from existing booleans; only facets with ≥3 lenses | ~800 |
| `/lenses/[focal]` (`/lenses/50mm`, `/lenses/24-70mm`) | focal hubs across mounts | ~150 |
| `/compare/lenses/[a]-vs-[b]`, `/compare/cameras/[a]-vs-[b]` | static, canonical (alphabetical order, redirect reverse), server-rendered spec table + JSON-LD; seed from `lens_comparisons`/`camera_comparisons`; `noindex` interactive `/compare` | 3–10k on-demand ISR |
| `/years/[year]` | release timelines | ~120 |
| `/series/[slug]` alias | shorter; 308 old | 124 |
| `/glossary/[term]` (P2) | definitional answers AI assistants cite | 50–100 |
| `/data`, `/api/v1` docs, `/llms.txt`, `/llms-full.txt` | §10 | 4 |

## 5. Internal linking

Lens page links to filter URLs only (`lenses/[slug]/page.tsx:169-212`), other versions (`:291`), source URL, history. Never to `/systems/[slug]`, series, collections, compatible cameras, brand. Mount row is plain text (`:148`). No breadcrumb (`BackButton` `:161`). Headings h1 (`:163`) → h3 ×4 (`:259,:272,:285`). Camera page: unlinked system badge (`cameras/[...slug]/page.tsx:108`). System page: links all lenses/cameras (`:133,:189`) but capped at 500 (`:81,:88`), no pagination. Lists: first 50 anchors server-rendered (`lib/lens-list.ts:6`), then IntersectionObserver + `fetch('/api/lenses?cursor=')` (`LensList.tsx:165-227`, `CameraList.tsx:131-176`) with no `<a href="?cursor=">` fallback. Verdict: ~9,500 lenses have ~2 inbound links each (sitemap + system/series tables); structurally shallow.

## 6. Rendering & caching

| Route | Code | Live |
|---|---|---|
| `/` | `revalidate` (`page.tsx:9`) | `HIT` ✔ |
| `/lenses/[slug]` | `revalidate` (`:26`), `notFound()` (`:50`) | **`private, no-cache, no-store`, `MISS`** |
| `/cameras/[...slug]` | same (`:21,:47`) | same |
| `/systems/[slug]` | `revalidate` + `generateStaticParams` (`:21-25`) | `public, max-age=0, must-revalidate`, `BYPASS` on probe — check |
| `/lenses` list | `searchParams` → dynamic | `no-store`, `MISS` |
| missing slug | 404 ✔ | 404, `no-store` (re-rendered per hit) |

Root cause: `src/components/EbayListings.tsx:144` `await headers()` — in Next 16 without `cacheComponents`, any `headers()` call (even inside `<Suspense>`) makes the whole route dynamic. Fixes: (1) client component fetching `/api/ebay?slug=` (reads `x-vercel-ip-country` there); (2) `cacheComponents: true` + `"use cache"` with eBay as a PPR hole; (3) drop geo, default `EBAY_US`. Also cache `getEntityPriceHistory`, other-versions and `extraSystems` queries (`lenses/[slug]/page.tsx:60-92`) under the `lenses` tag.

## 7. Headings, semantics, images

One h1 with entity name on every entity page ✔ (`lenses:163`, `cameras:99`, `systems:97`, `collections:74`, `series:74`). Lens/camera skip h2. `SpecsTable` is a real `<table>` (`ui/table.tsx`) but no `<th scope="row">`/`<caption>`. Alt: `ImageGallery.tsx:71,107,139` `alt || "Image"`; DB images carry the lens name (live `alt="7Artisans AF 40mm F2.5"`) ✔; local files get `alt: ""` (`lib/images.ts:26`) → "Image"; eBay thumbs `alt=""` (`EbayListings.tsx:191`, fine). No quotable lead sentence; no visible `dateModified`.

## 8. Performance (code)

Geist via `geist/font` (`layout.tsx:5-6`) ✔. `next/image` `fill` + `sizes` (`ImageGallery.tsx:110,142`) ✔ but product image is `loading="lazy"` (live) — make it `priority`. `PageTransition` (`page-transition.tsx:5-15`) → SSR `<div style="opacity:0">`; LCP waits for hydration + 250 ms; JS failure = blank page. `motion` also in root layout via `header-nav.tsx:5`, `scroll-to-top.tsx:5`; `cmdk` in root layout via `HeaderSearch` → `ui/command.tsx`; `recharts` statically imported by `PriceCard.tsx:9` → on every detail page. 19 script chunks on a lens page. No `X-Robots-Tag`.

## 9. Firewall consequence analysis & recommendation

Live 2026-09-02 ~21:40 UTC, residential IP: WebFetch and curl (UAs `curl/8.0`, GPTBot/1.2, ClaudeBot/1.0, PerplexityBot/1.0, Slackbot-LinkExpanding, Chrome/140) all returned 200 + full HTML for robots, sitemap, lists and a lens page. **The challenge-all rule is not active right now; verify in the Firewall tab.** Analysis below assumes the rule as described (path `.*` → Challenge; bypass `(AS15169 ∧ UA~Googlebot) ∨ (AS8075 ∧ UA~bingbot)`; cron bearer bypass above).

Vercel docs: custom-rule Challenge serves a JS checkpoint that "non-browser clients cannot pass"; verified-bot exemption is documented only for the managed Bot Protection ruleset and Attack Mode, not custom rules. Blocked classes:

| Class | Bots | Why the bypass misses them |
|---|---|---|
| Google non-Googlebot UAs | **Google-InspectionTool** (Search Console URL inspection), **Chrome-Lighthouse** (PageSpeed, from AS15169), GoogleOther, Google-Site-Verification, FeedFetcher, AdsBot | UA lacks "Googlebot" |
| Google-Extended | robots token on Googlebot infra | passes ✔ |
| Bing | bingbot ✔; BingPreview, MicrosoftPreview, adidxbot ✗ | UA |
| Other search | DuckDuckBot (Azure AS8075, UA ≠ bingbot), Applebot (AS714/6185; Siri/Spotlight/Apple Intelligence), YandexBot (AS13238), Baiduspider, Seznam, Mojeek | |
| OpenAI | GPTBot, **OAI-SearchBot** (the one that yields ChatGPT citations), ChatGPT-User — Azure; `openai.com/gptbot.json`, `searchbot.json`, `chatgpt-user.json` | |
| Anthropic | ClaudeBot, Claude-SearchBot, Claude-User — `claude.com/crawling/bots.json` (mostly GCP AS396982) | |
| Perplexity | PerplexityBot, Perplexity-User — `perplexity.com/perplexitybot.json`, `perplexity-user.json` | |
| Others | Amazonbot (AS16509, IP pages on developer.amazon.com), CCBot (`index.commoncrawl.org/ccbot.json`, FCrDNS), Meta-ExternalAgent/Fetcher (AS32934), DuckAssistBot, Mistral, cohere-ai, Bytespider (unverifiable — keep blocked) | |
| Unfurlers | Slackbot (AWS), Twitterbot (AS13414), facebookexternalhit/WhatsApp (AS32934), Discordbot (AS396982), TelegramBot (AS62014/62041), LinkedInBot (AS14413), iMessage (Applebot UA) | all blank cards |
| Reference/archival | Wikimedia IABot/Citoid (AS14907), archive.org (`archive.org_bot`, `ia_archiver`; AS7941) | citations marked dead; no Wayback |
| Monitoring | UptimeRobot, Checkly, Search Console | |

Per your firewall telemetry the AI-bots rule matched ~134 req/day — never the load problem; the load was fake-Chrome residential traffic plus uncached entity pages (§6).

Recommended rule set (custom-rule conditions available: Path, Query, Header, Cookie, Method, Host, IP, Geo, **AS Number**, **User Agent**, JA3/JA4, Rate limit; no "verified bot" condition, but the managed Bot Protection ruleset and Attack Mode exempt Vercel's verified directory — bots.fyi lists Googlebot, Bingbot, DuckDuckBot, Applebot, YandexBot, Baiduspider, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended, Amazonbot, CCBot, LinkedInBot, Slackbot, Twitterbot, DuckAssistBot as verified; not Meta-ExternalAgent, facebookexternalhit, WhatsApp, Discordbot, TelegramBot, ia_archiver, Chrome-Lighthouse):

| # | Rule | Condition | Action |
|---|---|---|---|
| 1 | Cron bypass (existing) | `Authorization: Bearer …` on `/api/cron/*` | Bypass |
| 2 | Google tools | AS 15169 AND UA contains any of `Googlebot`, `Google-InspectionTool`, `Chrome-Lighthouse`, `GoogleOther`, `Google-Site-Verification`, `FeedFetcher-Google`, `Storebot-Google`, `AdsBot-Google` | Bypass |
| 3 | Bing | AS 8075 AND UA any of `bingbot`, `BingPreview`, `MicrosoftPreview`, `adidxbot` | Bypass |
| 4 | Meta/WhatsApp | AS 32934 AND UA any of `facebookexternalhit`, `WhatsApp`, `Meta-External` | Bypass |
| 5 | Discord | AS 396982 AND UA `Discordbot` | Bypass |
| 6 | Telegram | AS 62014 or 62041 AND UA `TelegramBot` | Bypass |
| 7 | Internet Archive | AS 7941 AND UA any of `archive.org_bot`, `ia_archiver`, `Wayback` | Bypass |
| 8 | Wikimedia | AS 14907 | Bypass |
| 9 | Apple | AS 714 or 6185 AND UA `Applebot` | Bypass |
| 10 | Deny hosting ASNs (existing 55) | remove 396982 (GCP), 16509 (AWS), 8075 (Azure) if present — ClaudeBot/Discord on GCP, Slackbot/Amazonbot on AWS, OpenAI/DuckDuckBot on Azure | Deny |
| 11 | Rate limit (existing) | 60 req/min/IP | Challenge, persist 10 min |
| 12 | **Managed Bot Protection** | — | **Challenge** (replaces custom `.* → Challenge`; auto-exempts verified bots; still challenges curl/fake-Chrome/headless/residential scrapers) |
| 13 | Fake/outdated Chrome UA (existing) | regex | Challenge |
| 14 | **Managed AI Bots** | — | **Allow / Log** (never Deny) |

If keeping the custom catch-all instead, bypass each AI vendor by **published CIDR** (not cloud ASN): OpenAI (3 JSON), Anthropic (`bots.json`, hourly), Perplexity (2 JSON), Amazon (3 pages), Common Crawl (`ccbot.json`), DuckDuckGo (help-page list + `duckassistbot.json`), Apple (`search.developer.apple.com/applebot.json`), Google (`googlebot.json`, `special-crawlers.json`, `user-triggered-fetchers-google.json`) — needs a weekly GitHub Action refreshing ~60 CIDRs via the Firewall REST API; that maintenance is the argument for the managed ruleset.

Trade-off: challenge-all buys protection against ~22 req/min stealth scraping; the managed ruleset buys the same minus ~150–500 verified-bot req/day while restoring search coverage beyond Google/Bing, all AI citations, social previews, Wayback and PageSpeed. Once `/lenses/[slug]` is CDN-cached (§6), a full 12k-page recrawl costs zero Postgres queries.

## 10. AEO readiness

`/llms.txt` 404; no `llms-full.txt`; no lead sentence (`lib/format-description.ts:5-17` only fixes spacing); inconsistent counts; `/api/lenses?slug=`, `/api/cameras`, `/api/systems`, `/api/search` exist but rate-limited (`api/lenses/route.ts:10-12`), undocumented, robots-disallowed; MCP is stdio-only (`mcp-server/src/server.ts:97`), consumed in-process by `/api/chat` (Gemini 2.5 Flash via gateway, `api/chat/route.ts:64`, BotID-protected); no dataset; no About/Methodology page (provenance of 8,400 booklets lives only in `page.tsx:211-216`); no `dateModified`.

Recommendations: (1) lead sentence + JSON-LD; (2) `/llms.txt` + `/llms-full.txt` generated from DB (one line per lens, ~1.5 MB, regenerate with sitemap); (3) public `/api/v1/{lenses,cameras,systems,brands}/{slug}` with `s-maxage=604800`, CORS `*`, OpenAPI at `/developers`, out of robots disallow; (4) remote MCP endpoint (`/mcp`, Streamable HTTP) — transport change only — listed in registries and `llms.txt`; (5) `/data` nightly CSV/JSON (CC BY-SA 4.0) + `Dataset` JSON-LD; (6) About/Methodology + visible "Updated" + revision link; (7) one cached count helper shared by home, OG image, llms.txt.

## 11. `public/`, icons, headers

`public/` holds only create-next-app SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) — delete. No `favicon.ico`, `manifest`, `apple-icon`; `src/app/icon.svg` serves the icon ✔ — add `apple-icon.png` (180×180) and `manifest.ts`. `next.config.ts:4-30`: HSTS preload, nosniff, `X-Frame-Options DENY`, CSP (`unsafe-inline`/`unsafe-eval`), referrer policy — none SEO-negative; no `X-Robots-Tag` (consider noindex on `/api/*`). CSP `img-src` allows `web.archive.org`, `i.ebayimg.com` (`:16`). `proxy.ts:52-54` matches only `/admin`, `/api`.

## 12. Live checks

| Check | Result |
|---|---|
| `/robots.txt` | 200, generated content |
| `/sitemap.xml` | 200, 12,076 URLs, 1.77 MB, no `lastmod` |
| `/lenses/7artisans-af-40mm-f2-5` | 200 dynamic (`no-store`, `MISS`), 0 JSON-LD, global OG/description, no canonical, h1 ✔, `<table>` specs, alt ✔, image `loading="lazy"`, `<main><div style="opacity:0">` |
| `/lenses/does-not-exist` | 404 ✔ (dynamic) |
| `/systems/canon-eos` | 308 → `/systems/canon-ef` ✔ |
| `/lenses/compare?lens1=a&lens2=b` | 307 → `/compare?…` (should be 308) |
| Challenge | none observed for any UA |
| `site:thelensdb.com` (WebSearch) | backend doesn't honour `site:` — inconclusive; use Search Console coverage |
| `"thelensdb"` mentions | only the homepage itself; no forum/Reddit/Wikipedia references; `lens-db.com` (original) still ranks for the brand phrase; backlink profile effectively zero |

## Prioritised action list

**P0 (each ≤1 day)**
1. Make entity pages cacheable: remove `headers()` from the RSC path (`EbayListings.tsx:144`); cache remaining per-render queries (`lenses/[slug]/page.tsx:60-92`); verify `x-vercel-cache: HIT` on `/lenses/*`. S–M.
2. Firewall: managed Bot Protection (Challenge) + bypass table §9; AI-bots ruleset Log; prune GCP/AWS/Azure from deny list. S (dashboard).
3. Remove/replace `PageTransition` opacity wrapper; `priority` on product image. S.
4. `generateMetadata` on all entity routes (templated title, generated description, canonical, OG/Twitter); `title.template` in layout. S.
5. `noindex, follow` on `/search`, `/compare` (with params), `/history/*`, `/chat`, `/login`, `/register`, `/submit`; drop `/search`, `/compare` from sitemap. XS.
6. `permanentRedirect()` for merged entities, `systemRedirects`, `/lenses/compare`. XS.

**P1 (this month)**
7. JSON-LD graph via `lib/jsonld.ts` (Product/BreadcrumbList/WebPage; CollectionPage/ItemList; WebSite/Organization). M.
8. Visible breadcrumb; link system badges; add Series / Collections / Compatible cameras sections on lens pages. M.
9. `/brands/[brand]` + paginated lists; sitemap + breadcrumbs. M.
10. Per-entity `opengraph-image.tsx`. S–M.
11. Sitemap index by type + `lastmod` (add `updated_at` or derive from revisions); images sitemap. M.
12. Crawlable `?page=N` pagination on lists and system pages; lift 500 cap. M.
13. `/llms.txt`, `/llms-full.txt`, About/Methodology, consistent counts. S.
14. Lead sentence; h3 → h2; `<th scope="row">`; descriptive alts. S.

**P2 (next quarter)**
15. Static `/compare/lenses/[a]-vs-[b]` seeded from `lens_comparisons`; noindex interactive tool. M–L.
16. `/cameras/[slug]/lenses`, `/systems/[slug]/lenses/[facet]`, `/lenses/[focal]`, `/years/[year]`. L.
17. Drop `/cameras/camera/` with 308s; `/series/[slug]` alias. S–M.
18. Public `/api/v1` + docs + CORS + CDN caching; remote MCP; `/data` + `Dataset` JSON-LD. L.
19. Wikidata `sameAs` for brands/mounts/notable lenses. M.
20. Lazy-load recharts/cmdk/motion; manifest + apple icon; delete stray SVGs. S.