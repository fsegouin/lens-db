# The Lens DB — Heuristic UX audit (thelensdb.com)

Date: 2026-09-02 · Viewports: desktop 1440×900, mobile 390×844 (Chrome, DevTools emulation) · Mode: read-only browsing, no login, no edits, no ratings.
Screenshots: `screens/` (same directory as this document). Lighthouse HTML reports: `lighthouse-home-mobile.html`, `lighthouse-lens-mobile.html`.

Severity scale: **Critical** = blocks or misleads a core task · **Major** = significant friction / credibility loss · **Minor** = friction with a workaround · **Cosmetic** = polish.

---

## 1. Executive summary

**Biggest weaknesses**

1. **Search fails on the way real photographers type.** `50mm 1.4`, `canon ef 50 1.8`, `sony 24-70 gm`, and the typo `sumicron` all return **zero results** on both `/search` and the `/lenses` search box, with no suggestions. Only exact-token phrasing (`85mm f/1.4`, `Canon EF 50mm`) works. (07-search-desktop.png, 02-lenses-search-50mm14.png)
2. **The lens detail page buries the reference content.** Specs start ~1,600 px down on desktop and at 2,133 px of 3,020 px on mobile, after a rating strip, a price guide, a chart and six eBay cards. The page reads as an affiliate storefront first, an encyclopedia second. (03-lens-desktop-full.png, 03-lens-mobile-full.png)
3. **Visible data-quality errors on the flagship page** undermine "Wikipedia-grade" trust: *Rarity: Extremely rare ★★★★★* for a mass-market Sigma 85mm Art with 37 recorded sales; *Excellent $580–700* priced below *Good $671–740*; *Lens Groups 15 > Lens Elements 11* (physically impossible); eBay cards at $1,355–1,555 next to a $580–740 guide.
4. **Duplicates everywhere the user looks**: "Most Compared" on the home page is literally duplicate-vs-duplicate pairs (Canon 19mm F/3.5 vs Canon 19mm F/3.5 LSM; Biometar Type 2 vs BIOMETAR; Pentax 67 vs 6×7); the Leica M list has *Leica M 35mm F1.2 Noctilux Asph.* and *Leica NOCTILUX-M 35mm F/1.2 ASPH.* as two rows; Chat recommended the same Viltrox 56mm and 75mm twice; the Collections index has seven duplicate titles (Fisheye ×2, Macro 1:1 ×2, Macro 1:2 ×2, "Nifty forties"/"Nifty fourties", three Tamron Adaptall pairs).
5. **Collection detail pages are broken**: `/collections/pancake-lenses` renders as a single unstyled wall of text — paragraphs run together ("weight.First pancake…"), the "QUICK JUMP TO" index and every lens row are inline with bullet glyphs, zero headings, zero images. (06-collection-pancake.png)
6. **No structured data and generic metadata on entity pages**: 0 JSON-LD blocks, no canonical, meta description and OG tags are the site-wide boilerplate on every lens/camera page. For a site whose growth channel is Google, this is the single biggest SEO gap.
7. **The mobile lens list is a desktop table squeezed into 358 px**: 13 stacked filters push the first result to y=725 px (below the fold), and the 1,008 px-wide table scrolls sideways with no sticky name column and no card layout. (02-lenses-mobile.png)
8. **The home page shows the wrong things**: "Most Popular Lenses" is led by *[Auto] Tamron-F 28mm F/2.8* (127 views) and a *Zeiss N-Mirotar 210mm F/0.03* rated 10.0/10; counts contradict the list pages (7,400+ vs 9,575 lenses; 1,000+ vs 2,187 cameras); the About text promises a "Report an Issue" button that does not exist.
9. **Dead-ends and missing cross-links**: the 404 page is the bare Next.js default with no nav; the footer has zero links; camera pages don't link to their system or list compatible lenses; lens pages have no Compare CTA, no related/alternative lenses, no breadcrumb.
10. **System pages render 494-row tables in one go** (22,231 px tall, no filter/sort) and the Systems index is a flat A–Z list where "Canon Mirror Box 2" gets the same weight as "Sony E".

**Biggest strengths**

- Fast: home LCP 182 ms, lens page LCP 1.14 s, CLS 0 on both; Best Practices 100, SEO 100 (Lighthouse mobile).
- Clean, consistent visual system; light/dark toggle works and persists (localStorage `theme`).
- Table interactions are well done on desktop: click-any-cell-to-filter, sortable headers, URL-synced state (`?system=leica-m&sort=price&order=asc`), infinite scroll that actually works.
- Header typeahead is grouped (Lenses / Cameras) with "View all results" and feels instant.
- Price guide + sale-history chart + eBay integration is a genuine differentiator no competitor database has.
- Chat answered a realistic purchase question in ~10 s with 14 linked, correctly-mounted, in-budget lenses.
- Camera pages carry solid physical/sensor data (dimensions, screen, storage, USB spec).
- Edit / View history / Flag duplicate affordances exist on every entity — the wiki skeleton is there.

---

## 2. Per-page findings

### 2.1 Home `/` (01-home-desktop.png, 01-home-desktop-full.png, 01-home-mobile.png, 10-home-light.png)

5-second test: a first-time visitor understands "this is a database of camera lenses" (H1 *The Camera Lens Database*) and sees three buttons. They do **not** learn what makes it different (used-price guide, 9.5k lenses back to the 1940s, camera bodies, community edits) and there is **no search box in the hero** — search is a magnifier icon in the header. Primary action = *Browse Lenses* → drops the user into a 9,575-row table.

| Sev | Finding |
|---|---|
| Major | No hero search. Value proposition is a generic sentence ("Comprehensive database … expert recommendations for every genre of photography") — no recommendations exist anywhere on the site. |
| Major | "Most Popular Lenses" ranked purely by page views (29–127 views) surfaces obscure/junk records: *[Auto] Tamron-F 28mm F/2.8* (name has a bracketed prefix), *Carl Zeiss N-Mirotar 210mm F/0.03* at 10.0/10. Exposes low traffic and makes the site look like a scrape. |
| Major | "Most Compared" is 6 of 10 pairs comparing a record with its own duplicate — a public display of the dedupe problem. |
| Major | Counts inconsistent with list pages: 7,400+ lenses vs 9,575; 1,000+ cameras vs 2,187; 50+ collections vs 47. |
| Minor | About text: "use the **Report an Issue** button on any lens or camera page" — no such button; pages have *Edit* and *Flag duplicate*. |
| Minor | Nav *Compare* → `/compare`, hero *Compare Lenses* → `/lenses/compare` (redirects). Nav *Submit* silently redirects anonymous users to `/login?next=/submit`. |
| Minor | Footer has zero links (no About, Contact, Privacy, Terms, Sources, API, source repository, sitemap). |
| Cosmetic | Mobile: hero copy fills the whole first screen; the third CTA wraps to its own line. |

### 2.2 Lenses list `/lenses` (02-lenses-desktop.png, 02-lenses-cellfilter.png, 02-lenses-search-50mm14.png, 02-lenses-mobile.png, 02-lenses-mobile-full.png)

What works: cell-click filtering (System cell → `?system=leica-m`, "658 lenses found"); header sort with URL sync; infinite scroll loads 50 rows per step (51→101→151 observed); *Browse by series* link.

| Sev | Finding |
|---|---|
| Critical | In-page search: `50mm 1.4` → **"No lenses found."**; `canon ef 50 1.8` → 0. `50mm` → 1,214; `summicron` → 166. Multi-token/aperture queries don't work. Empty state offers no hint, no "clear filters", no suggestions. |
| Major | Default sort is Year ↓, so the first screen is a wall of "2026" rows, several implausible (*Carl Zeiss Biogon T\* 2,8/21 ZM — 2026*, *7Artisans 75mm F/1.25 II M — 2026*). First impression = wrong data. |
| Major | 13 filters as native `<select>`s. Brand select has ~280 options including non-brands (*Fixed-lens, Genres, Konverter, Limitation, Links*) and case duplicates (*Lentar / LENTAR*, *Leica / Leitz*). No type-ahead inside selects. |
| Major | Infinite scroll only: no pagination, no "jump to", no back-to-top, no result position in URL → 190 scroll-loads to reach the end of 9,575 rows; Back from a detail page loses position. |
| Major | Rating column is "—" for every row on the first two pages; Avg Price "—" for many. Empty columns cost 20% of the width. |
| Minor | Non-lens records in the lens table: *Leitz Wetzlar Visoflex III* (a viewfinder attachment) with no focal length/aperture. |
| Minor | Duplicates side by side: *Leica M 35mm F1.2 Noctilux Asph.* and *Leica NOCTILUX-M 35mm F/1.2 ASPH.* (same $10,499 / 416 g). |
| Minor | Sub-header text changes meaning: "9575 lenses found" normally, "Search and filter 7,400+ camera lenses" when the result set is empty. |
| Cosmetic | "+2" mount badges are buttons with no tooltip explaining the other mounts. |

**Mobile:** the 13 filters stack into a 653 px block; first result at y=725 px, below the 844 px fold once the header is counted. Table is 1,008 px wide inside a 358 px scroll container (`overflow-x:auto`) — the Name column is not sticky, so users scroll sideways and lose which lens they're reading. No card/list mode, no "Filters" drawer, no applied-filter chips.

### 2.3 Lens detail `/lenses/sigma-85mm-f1-4-dg-dn-art` (03-lens-desktop.png, 03-lens-desktop-full.png, 03-lens-mobile.png, 03-lens-mobile-full.png)

Top-to-bottom order observed: *Back to lenses* (a button, not a link) → H1 → chips (Brand, Leica L, Sony E, Full Frame, Prime lens, "2 views") → image carousel (native image 207×151 px displayed at ~620 px) → rating buttons 1–10 + "No ratings yet" → PRICE GUIDE (Fair/Good/Excellent, Rarity, "Based on recent eBay sales · Aug 2026") → price chart → *Sale history (37 records)* disclosure → EBAY LISTINGS (6 cards) + affiliate disclaimer → OPTICAL (9 rows) → PHYSICAL (6 rows) → *Edit · View history · Flag duplicate*.

Above the fold (desktop 1440×900): title, chips, image. **No spec, no price, no verdict is visible without scrolling.**

| Sev | Finding |
|---|---|
| Critical | Specs are the last content block. Desktop: OPTICAL heading at ~1,600 px. Mobile: 2,133 px of 3,020 px. A photographer checking "min focus distance / weight / filter size" scrolls past 6 eBay ads first. |
| Critical | Wrong/contradictory data in plain sight: **Rarity "Extremely rare ★★★★★"** (37 sales, 6 live listings); **Excellent $580–700 < Good $671–740**; **Lens Groups 15 > Lens Elements 11** (spec sheet says 15 elements / 11 groups); eBay cards at **$1,355–$1,555** vs guide ≤ $740. |
| Major | Zero prose. No description, history, versions (the Sony E and L-mount versions are the same record; the 2020 "020" designation isn't explained), no reviews/links, no sample images, no MTF, no sources. |
| Major | No Compare CTA, no "similar / alternatives" (Sony 85 GM, Samyang 85 AF…), no "compatible cameras", no "other lenses in this series", no breadcrumb (Lenses › Sigma › Art). Every dead-end forces the header. |
| Major | Rating widget: ten unlabelled numeric buttons directly under the hero with no prompt ("Rate this lens"), anonymous, above the price — it reads as a pagination control. |
| Major | Mount inconsistency: chips show *Leica L* and *Sony E*, but PHYSICAL says *Mount/System: Leica L* only. |
| Major | 4 of 6 eBay thumbnails are blank; all six `<img>` have empty alt. |
| Minor | Hero image is a 207×151 asset upscaled ~3× (soft). Carousel dots are 6 px tap targets (Lighthouse target-size fail). |
| Minor | Heading hierarchy: H1 → H3 (no H2); all-caps H3 labels (Lighthouse heading-order fail). |
| Minor | "2 views" counter on a reference page is noise and signals low traffic. |
| Minor | Missing fields a buyer expects: angle of view, length × diameter, MSRP at launch, weather sealing, hood in box, aperture ring / de-click, focus motor, internal focus, teleconverter compatibility. |
| Minor | *Edit* opens a dialog (login-gated) with no explanation of the edit model (moderated? instant?), no "last edited by / when" on the page. |

Would a **photographer researching a purchase** get what they need? Partially — they get used price and specs, but only after scrolling, with contradictory prices and no comparison to alternatives. Would a **collector** get what they need? No — no versions/variants, serial ranges, production years/quantities, history, or sources; rarity is wrong.

### 2.4 Cameras `/cameras` + `/cameras/camera/canon-eos-r50-v-2025` (04-cameras-desktop.png, 04-camera-detail-full.png)

| Sev | Finding |
|---|---|
| Major | List column **"Model" shows "Electronically controlled"** on every mirrorless/DSLR row — a shutter-type field mapped to the wrong column. "Film Type —" for all non-film cameras wastes a column. |
| Major | Detail page: system chip (*Canon RF*) is **not a link**; no "compatible lenses" section; no link to the system page. The only outbound links are eBay and *View history*. |
| Major | Same price-guide contradiction (Excellent $550–563 < Good $550–715) and mis-mapped "Model: Electronically controlled" inside SENSOR & IMAGING. *Lens Mount: Canon RF-S* vs system *Canon RF*. |
| Minor | Rating widget is placed **after** the eBay listings on camera pages but **before** the price guide on lens pages. |
| Minor | URL `/cameras/camera/<slug>` has a redundant segment. |
| Minor | Data smells on the first screen: *Leica M11 Monochrom "Marble Edition"* avg price **$34**; *Leica M EV1* in system *Leica M39*; *Fujifilm GFX 100RF* system "—". |

### 2.5 Systems `/systems` + `/systems/sony-e` (05-systems-desktop.png, 05-system-sony-e-full.png)

| Sev | Finding |
|---|---|
| Major | Index: 132 cards in one flat A–Z list, 7,066 px tall, no search, no grouping (manufacturer / format / era / active-vs-discontinued), no lens/camera counts on cards. |
| Major | Detail: the full 494-row lens table is rendered at once (page 22,231 px; 562 rows incl. cameras) with no filter, sort, or search. Duplicate rows visible (*APO-LANTHAR 65mm F/2 Macro E* / *Macro APO-Lanthar 65mm F/2 E*). |
| Minor | System page has one descriptive sentence and no mount facts table (flange distance is mentioned in prose only; no throat diameter, protocol, adapters, launch/discontinued dates, timeline, notable bodies). |
| Minor | "31 views" counter again. |

### 2.6 Collections `/collections` + `/collections/pancake-lenses` (06-collections-desktop.png, 06-collection-pancake.png)

| Sev | Finding |
|---|---|
| Critical | Collection detail renders as **one unformatted text block**: no paragraph breaks ("weight.First pancake…"), the QUICK JUMP TO anchor list and every lens entry (name • filter Ø • type • year) are inline with "●" glyphs, 0 headings, 0 images, and the 71 links are visually indistinguishable from text. The scraped legacy HTML structure was flattened. |
| Major | Index has duplicate collections: *Fisheye lenses* ×2, *Macro 1:1* ×2, *Macro 1:2* ×2, *Nifty forties / Nifty fourties*, *Tamron Adapt-A-Matic / …lenses*, *Adaptall / …lenses*, *Adaptall-2 / …lenses*, *Leica M limited special editions / Leica M special limited editions*, same for Leica R. |
| Major | Several index cards preview raw table text ("DateModel / EditionUnits1947Contax II Ivory1982…"); *Canon special limited editions* says "2 lenses" while the preview lists 7 cameras. |
| Minor | Jump-to anchors use legacy system names (*Canon EOS system*, *Asahi Pentax M42 system*, *Leica L APS-C system*) that no longer match the consolidated Systems taxonomy. |

### 2.7 Search — header + `/search` (07-search-desktop.png, 07-header-search-summ.png, 07-search-results-canon-ef-50mm.png, 07-search-mobile.png)

Header: clicking the magnifier expands an inline field that **replaces the whole primary nav**; typing shows a grouped dropdown (Lenses / Cameras) + *View all results*. Good pattern, fast.

`/search`: hard cap of **20 results with no total, no pagination, no "see all in Lenses"** — `summicron` shows 20 while the lens list has 166. Result rows show only name + "35mm f/2": no mount, year, thumbnail, or price. No filters. No suggestions on zero results. See the table in §3.

### 2.8 Compare `/compare` (08-compare-empty.png, 08-compare-two-lenses-full.png)

| Sev | Finding |
|---|---|
| Major | The only entry point is the Compare page's two "Search for a lens…" comboboxes. No "Add to compare" on lens rows or detail pages, no compare tray. |
| Major | Limited to exactly 2 items; no images, no price rows, no "differences only" toggle or highlighting of the better value. |
| Minor | Rows are inconsistent across records: *Type* "Short telephoto prime lens" vs "Prime lens"; *Status / Era / Lens Hood* exist for one lens and "—" for the other. |
| Cosmetic | `/lenses/compare` redirects to `/compare` (fine), but the hero and nav link to different URLs. |

### 2.9 Chat `/chat` (09-chat-empty.png, 09-chat-answer.png)

Asked: *"what's a good portrait lens for a Fuji X-T5 under 500?"* → answer in ~10 s: explains the 50–90 mm APS-C range, lists 14 lenses with median used prices, each linked to its page, ends with a follow-up question. Content-wise this is the best experience on the site.

| Sev | Finding |
|---|---|
| Major | Recommendations contain **duplicate records** (Viltrox AF 56mm F/1.2 ASPH ED IF VCM Pro / Viltrox AF 56mm F1.2 Pro; Viltrox 75mm F/1.2 twice; Tokina 56mm "E / X" and "X"). |
| Minor | The three example prompts are plain text, not clickable; no conversation history; no "AI-generated, verify" disclaimer; no inline images or a "compare these" action. |
| Minor | Empty state is a full-height blank screen with the input pinned at the bottom (desktop). |

### 2.10 Header / footer / nav / auth (10-nav-mobile-menu.png, 10-login.png, 10-home-light.png)

- Desktop nav: 8 items + search + theme + *Sign in*. *Chat* carries a "New" badge. *Submit* is login-gated (redirect). Active state is a filled pill — clear.
- Mobile: hamburger opens a right sheet (Menu › Home … Chat, Search, Sign in, Create account). Works; Escape closes.
- Theme toggle: `aria-label` flips correctly, persists via `localStorage.theme`, light theme renders cleanly.
- `/login` exists (email + password, "Create one" link); no OAuth; page `<title>` is the generic site title.
- Footer: two lines of text, **no links**. No skip-to-content link (Minor, a11y).
- 404 (`/lenses/this-lens-does-not-exist`): bare "404 This page could not be found." — no header, nav, or search (Major).

---

## 3. Search quality table

| Query | Where | Result | Verdict |
|---|---|---|---|
| `50mm 1.4` | /search and /lenses | **No results** | Fail — aperture without `f/` isn't parsed; multi-token AND on raw name |
| `85mm f/1.4` | /search | 20 lenses (Samyang ×6, Sigma, Canon, Nikon, Zeiss Otus…) | Works, but capped at 20 with no total; Samyang/Rokinon dual-name variants dominate |
| `nikkor 35` | /search | 20 results incl. *NIKKOR-T 350mm*, *35-70mm* / *35-105mm* zooms, *Artra Lab NONIKKOR* | Partial — substring match, no focal-length semantics, no ranking of the mainstream AF-S 35/1.8G above 1950s rangefinder glass |
| `sony 24-70 gm` | /search | **No results** | Fail — "GM" / "G Master" and the hyphenated range aren't normalised |
| `summicron` | /search | 20 lenses (list page has 166) | Works, but the 20-cap hides 146; special editions (Gold Dragon, Sultan of Brunei) rank alongside standard lenses |
| `canon ef 50 1.8` | /search and /lenses | **No results** | Fail — "50" without "mm" and "1.8" without "f/" |
| `Canon EF 50mm` | /search | 8 lenses incl. both *EF 50mm f/2.5 Macro* and *EF 50mm F/2.5 Compact Macro* (duplicate) | Works; exposes a duplicate |
| `sumicron` (typo) | /search | **No results** | Fail — no fuzzy matching, no "did you mean" |
| `x-t5` | /search | 2 cameras: *X-T50*, then *X-T5* | Works; exact match ranked second |
| `micro four thirds` | /search | 1 system: *Micro Four Thirds* | Works; no lenses/cameras for that mount are shown alongside |
| `summ` (header typeahead) | header | Summicron-SL 21, SUMMILUX-R 50 Gold, Summicron-M 28… + 3 cameras | Works; prefix match, special editions surface early |

---

## 4. Mobile-specific findings (390×844)

| Sev | Finding | Screenshot |
|---|---|---|
| Critical | Lens list: 13 stacked filters (653 px) push the first row below the fold; 1,008 px table in a 358 px viewport scrolls horizontally with no sticky first column, no card view, no filter drawer. | 02-lenses-mobile.png |
| Major | Lens detail: specs at 2,133 px of a 3,020 px page. 61 of 68 tap targets are under 44 px (chips, eBay links, carousel dots). Rating buttons wrap 7 + 3. | 03-lens-mobile.png |
| Major | Systems detail (Sony E): 22 k px page with a 6-column table. | — |
| Minor | Home: hero copy + three CTAs consume the entire first screen; the fourth stat card is ~1,500 px down. | 01-home-mobile.png |
| Minor | Search results cards are readable and tappable — the best mobile screen. | 07-search-mobile.png |
| Minor | Header search on mobile replaces the logo row; no cancel affordance other than Escape/blur. | — |
| Positive | No horizontal page overflow anywhere (`scrollWidth` = 390 on all pages tested); the mobile menu sheet is clear and complete. | 10-nav-mobile-menu.png |

---

## 5. Lighthouse (mobile) + performance trace

The chrome-devtools Lighthouse tool audits Accessibility / Best Practices / SEO (the Performance category is not included); performance numbers below come from a DevTools trace (no throttling).

| Page | Accessibility | Best Practices | SEO | LCP (lab) | CLS |
|---|---|---|---|---|---|
| Home `/` | **96** | 100 | 100 | 182 ms (TTFB 123 ms) | 0.00 |
| Lens detail | **90** | 100 | 100 | 1,141 ms (TTFB 80 · load delay 730 · render delay 332) | 0.00 |

Failed audits and top opportunities:
- **color-contrast** (both pages): `text-zinc-500` secondary text on near-black (footer, "Based on recent eBay sales", sale-history summary, the muted `#1` rank numerals at 20% opacity).
- **heading-order** (lens page): H1 → H3 with no H2.
- **target-size** (lens page): carousel dot buttons are 6×6 px.
- **LCP discovery** (lens page): the hero image is not discoverable from HTML — 730 ms load delay; add `priority`/preload on the first carousel image and serve it at ≥ 2× the display size.
- **Forced reflow** during hydration on the lens page (minor).
- Not measured by Lighthouse but observed: 4 of 6 eBay thumbnails fail to load; all have empty `alt`.

---

## 6. Structured data / metadata (lens detail page)

- `script[type="application/ld+json"]` count: **0** (also 0 on the home page).
- `document.title`: `Sigma 85mm F1.4 DG DN Art | The Lens DB` (good).
- `meta[name=description]`: `Comprehensive database of camera lenses and bodies with specs, compatibility, and expert recommendations.` — **site-wide boilerplate**, identical on home, lens, camera, and system pages.
- `link[rel=canonical]`: **absent**.
- Open Graph: `og:title = The Lens DB - Camera Lens Database`, `og:description` = boilerplate, `og:image` = generic site image, `og:type = website` — **not entity-specific**; shared links show no lens name or photo.
- `h1`: `Sigma 85mm F1.4 DG DN Art` (single H1, good); H2: none; H3: PRICE GUIDE, EBAY LISTINGS, OPTICAL, PHYSICAL.
- `html lang="en"`, viewport OK, no `meta robots`.
- Recommended: `Product` (+ `Offer`/`AggregateOffer` from the price guide, `brand`, `image`, `additionalProperty` for specs), `BreadcrumbList`, and `WebSite` + `SearchAction` on the home page; per-entity description ("Sigma 85mm F1.4 DG DN Art — full-frame prime for Sony E and L-mount, 630 g, 77 mm filter, introduced 2020. Used price $580–740.").

---

## 7. What a Wikipedia-grade reference page would need that the lens page lacks

1. **Lead paragraph**: what it is, for whom, when introduced, what it replaced / what replaced it, key claim to fame.
2. **Infobox above the fold**: focal length, max/min aperture, mount(s), format, elements/groups, MFD, magnification, filter, weight, dimensions, AF/IS, year, MSRP, status — as a scannable side panel next to the image, not the last section.
3. **Correct, validated data** with impossible values blocked (groups ≤ elements; Excellent ≥ Good ≥ Fair; rarity derived from sales volume).
4. **Versions & variants**: Sony E vs L-mount entries linked as variants of one design; "I / II / STM" successors; cosmetic editions collapsed under the parent.
5. **Compatibility**: bodies this mounts on natively, crop/behaviour on APS-C bodies, adapters, teleconverters.
6. **History & context**: announcement date, production run, serial ranges (for vintage), design lineage (a "Same optical design" collection already exists — surface it here).
7. **Sources / references**: manufacturer datasheet, catalogue scans (the original lens-db claimed 8,400+ booklets), reviews (external links), with citation markers on individual facts.
8. **Media**: high-resolution product photos, optical diagram, MTF chart, sample images with attribution and licence.
9. **Related content**: same series, same focal length on this mount, alternatives at similar price, "people also compared".
10. **Provenance UI**: "last edited by X on date · N revisions · discuss" visible on the page; edit history diff readable; a citable permalink and a "Cite this page" helper.
11. **Breadcrumb / taxonomy**: Lenses › Sigma › Art › 85mm F1.4 DG DN; brand and series pages linked both ways.
12. **Separation of reference vs commerce**: price guide and listings in a clearly labelled sidebar/tab with the affiliate note, never between the title and the specs.
13. **Entity-level SEO**: unique title/description, canonical, OG image with the lens photo, JSON-LD Product/Breadcrumb.
14. **Ratings with meaning**: labelled ("Rate this lens"), count + distribution, login or anti-spam, and distinct from editorial quality.

---

## 8. 20 prioritised recommendations

**Quick wins (days)**

1. **Fix search tokenisation**: normalise `1.4` → `f/1.4`, `50` → `50mm`, `24-70`, `GM` ↔ `G Master`; match on brand + focal + aperture fields, not just the name string. Kills 4 of the 5 failing queries.
2. **Add fuzzy/typo tolerance + "Did you mean"** (trigram / pg_trgm or Meilisearch) — `sumicron`, `nikor`, `voigtlander/voigtländer`.
3. **Raise the 20-result cap on `/search`**: show totals per group, "See all 166 lenses →" into `/lenses?q=`.
4. **Move OPTICAL/PHYSICAL specs above the price guide and eBay cards** on lens and camera pages (or two-column: infobox right of the image).
5. **Validate price guide + rarity**: enforce Fair ≤ Good ≤ Excellent, hide rarity unless sales < N, hide listings that are > 2× the guide (they're bundles/kits — the eBay query already excludes "-body -kit -bundle" but not price outliers).
6. **Fix the elements/groups swap** and audit the field with a `groups <= elements` check across the table.
7. **Replace "Most Popular Lenses" (by views) with a curated or normalised list** (rating × views with a floor, or editor's picks); strip "[Auto]" prefixes from names.
8. **Rebuild the collection detail template**: keep the source HTML structure (headings, paragraphs, tables), render jump-links as a list, add lens thumbnails.
9. **Entity metadata**: unique `<title>`/description/canonical/OG per lens, camera, system; add Product + BreadcrumbList JSON-LD.
10. **Fix the "Model" column** (shutter type) on `/cameras` and the mis-mapped field on camera detail; drop Film Type for non-film bodies.
11. **Footer + 404**: add About/Sources/Contact/Contribute/Privacy links; render the 404 inside the layout with a search box.
12. **Contrast + targets**: bump `text-zinc-500` to zinc-400 on dark; make carousel dots ≥ 24 px; label the rating strip "Rate this lens".

**Structural (weeks)**

13. **Dedupe pass with a visible merge workflow**: the *Flag duplicate* signal already exists — add an admin merge that redirects slugs, and a "variants of" relation (mount variants, cosmetic editions) so Most Compared / Chat / lists stop showing pairs of the same lens.
14. **Mobile list redesign**: collapsible "Filters (n)" drawer with applied chips, card rows (name, mount, focal/aperture, year, price), sticky name column if the table is kept; add "Back to top" and restore scroll position on Back.
15. **Filter UX**: searchable comboboxes for Brand/System/Series, remove non-brand entries, group systems by manufacturer, show result counts per option.
16. **Lens page as a reference article**: lead paragraph, infobox, variants, compatibility, sources, related lenses, "Compare with…" button, breadcrumb, edited-by/when. Keep price + listings in a sidebar.
17. **Systems overhaul**: index grouped by manufacturer/format with counts and active/discontinued badges; system detail with a mount facts table (flange, throat, dates, adapters) and a filterable/paginated lens table.
18. **Compare 2.0**: add-to-compare from lists and detail pages, tray with up to 4 items, images, price row, "show differences only", shareable URL (already there).
19. **Camera ↔ lens graph**: compatible lenses on camera pages (native + adapted), compatible bodies on lens pages, system chips as links everywhere.
20. **Home page as a front door**: hero search with typeahead, three audience paths (buy / research / collect), showcase Collections and the price guide, hide raw view counts.

---

## Appendix — screenshot index

| File | What |
|---|---|
| 01-home-desktop.png / -full.png | Home, dark, 1440 |
| 01-home-mobile.png | Home, 390 |
| 10-home-light.png | Home after theme toggle |
| 02-lenses-desktop.png | Lens list default |
| 02-lenses-cellfilter.png | After clicking a "Leica M" cell |
| 02-lenses-search-50mm14.png | "50mm 1.4" empty state |
| 02-lenses-mobile.png / -full.png | Lens list, 390 |
| 03-lens-desktop.png / -full.png | Sigma 85 Art detail |
| 03-lens-mobile.png / -full.png | Same, 390 |
| 04-cameras-desktop.png | Camera list |
| 04-camera-detail-full.png | Canon EOS R50 V |
| 05-systems-desktop.png | Systems index |
| 05-system-sony-e-full.png | Sony E (22 k px) |
| 06-collections-desktop.png | Collections index |
| 06-collection-pancake.png | Pancake lenses (unformatted) |
| 07-search-desktop.png | /search empty |
| 07-header-search-summ.png | Header typeahead "summ" |
| 07-search-results-canon-ef-50mm.png | /search results |
| 07-search-mobile.png | /search, 390 |
| 08-compare-empty.png / 08-compare-two-lenses-full.png | Compare |
| 09-chat-empty.png / 09-chat-answer.png | Chat |
| 10-nav-mobile-menu.png | Mobile menu sheet |
| 10-login.png | /login |
