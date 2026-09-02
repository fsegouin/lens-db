# thelensdb.com — Visual design critique & direction

Reviewed: 14 screenshots (desktop/mobile, light/dark), `globals.css`, `badge.tsx`, `table.tsx`, `SpecsTable.tsx`, `layout.tsx`, `page-transition.tsx`, `ImageGallery.tsx`, and sections 1 & 7 of the UX audit.

---

## 1. Visual diagnosis

### What the design currently communicates

**It looks like a well-built SaaS dashboard that happens to contain lens data.** Every visual cue points that way: near-black canvas, 10px-radius cards floating on a darker ground, a centred marketing hero with three pill buttons, four "stat cards" with 40px numbers, a sticky translucent blurred header. This is the 2023 shadcn/Vercel starter aesthetic, executed cleanly. It reads as *product*. A reference work reads as *document* — Wikipedia, GSMArena, Discogs and MusicBrainz all look like documents, and that is precisely why the web links to them. Right now nothing on the page says "this is the canonical record of this object."

**The hierarchy inverts the value proposition.** On `03-lens-desktop-full.png`, the visual weight order on a 5,000px page is: hero photo (620×470 upscaled), rating strip, price guide, sale chart, six eBay cards, *then* specs at ~1,330px. Specs — the only reason anyone links to this page — get the smallest type on the page (14px), the flattest treatment (undifferentiated hairline rows), and the deepest scroll position. The eBay cards get thumbnails, borders, coloured "Buy It Now" chips and a two-column grid. The design is telling the truth about the current priorities, and the truth is wrong.

### Typography

Geist Sans is a good choice — neutral, excellent numerals, a real mono companion. The execution wastes it.

- **Scale is compressed and unrhythmic.** Effectively three sizes carry the whole product: ~48px hero / ~34px page title / 16px / 14px, with a 12px uppercase micro-label doing the job of a section heading. There is no 20–24px step, so a section like `OPTICAL` has *less* weight than a table row label. Section headings must not be smaller than body text.
- **`OPTICAL`, `PHYSICAL`, `PRICE GUIDE`, `EBAY LISTINGS` are all the same 12px uppercase zinc-500 label.** Commerce sections and reference sections are typographically indistinguishable. On a reference page the specs sections should be the loudest thing after the title.
- **No tabular figures anywhere.** `85mm`, `F/1.4`, `630g`, `$1,555.28`, `$580–700`, `1:8.33` are all set in proportional Geist Sans. In the lens table (`02-lenses-desktop.png`) the Focal Length, Aperture, Year, Avg Price and Weight columns are *left-aligned proportional text* — the single most damaging typographic decision on the site. Numbers that should form a scannable vertical rule instead ripple.
- **Geist Mono is loaded and never used.** It exists in `layout.tsx` as `--font-geist-mono` and appears in zero components.
- **Line length is unmanaged.** The container is `max-w-7xl` (1280px) with no prose measure, so the pancake-lenses collection page runs ~110 characters per line (`06-collection-pancake.png`) — unreadable, and it is the only page on the site with real prose.
- **Mobile title wraps to two lines at 34px** ("Sigma 85mm F1.4 DG / DN Art") and the badge row wraps to two rows below it, so the mobile page opens with ~200px of chrome before any content.

### The all-neutral palette

`globals.css` is fully achromatic: every `--background`/`--foreground`/`--muted`/`--border`/`--primary` is `oklch(L 0 0)`. Chroma is exactly zero. The only chromatic tokens are `--chart-1…5` (all blue) and `--destructive`.

The intent is right — a reference work should be quiet. But zero chroma means **the design has no way to say "this is important" other than making something bigger or whiter.** There is no link colour, no active state, no "verified" signal, no accent to mark the current filter, no way to distinguish an editorial fact from a commercial one. It is not restraint; it is an absence. Wikipedia is 95% neutral *and* has `#3366cc` doing an enormous amount of structural work.

The compensating hack is `--primary: oklch(0.87 0 0)` in dark mode — a light grey primary button (see "Browse Lenses" on the home hero) that reads as *disabled*, not *primary*.

### The badge hues

`badge.tsx` carries eleven hardcoded colour variants: `system` blue, `lensType` green, `era` amber, `status` purple, `zoom` blue, `prime` green, `macro` purple, `teleconverter` orange, `series` indigo, plus `brand` and `destructive`. All hardcoded Tailwind palette classes, none tokenised, and `system`/`zoom` and `lensType`/`prime` are literal duplicates.

In `03-lens-desktop.png` this produces a rainbow strip directly under the H1: grey `Sigma`, blue `Leica L`, blue `Sony E`, outline `Full Frame`, green `Prime lens`. Nothing about the hue is meaningful — blue does not mean "mount", it means "someone picked blue for mounts". In the lens table it is worse: every row carries a green `Prime` chip and an indigo series chip, so ~40% of the table's visual energy goes to a badge that repeats identically 9,000 times. **Colour is being spent on the least informative column.** Meanwhile `Macro` (purple) and `Prime` (green) stack in one cell and blow the row height out to 1.6× (Brightin Star 60mm row).

The eleven hues also break the only real rule of an all-neutral system: if colour appears, it must mean something.

### Density

- **Desktop table**: `p-2` (8px) cells, `text-sm`, 40px effective rows. Density is genuinely decent — this is one of the better parts of the product.
- **Lens article**: far too airy for a reference page. ~30px between spec rows, ~60px between sections, a 470px hero, an 88px-tall rating strip. Roughly 22 facts occupy 900 vertical pixels where GSMArena would fit 60.
- **Systems hub**: three-column cards, ~200px each, with 2-line truncated descriptions and one badge. 132 systems become an ~9,000px scroll with no index, no A–Z rail, no grouping by manufacturer, and no lens counts. It is a card grid where a dense definition list belongs.
- **Mobile lens list** (`02-lenses-mobile.png`): thirteen stacked full-width filter controls push the first result to ~y=1,725px, then the desktop table renders horizontally scrolling with the name column wrapping to three lines. There is no card layout at all.

### The oversized upscaled hero image

The Sigma product shot renders at ~620×470 CSS px inside a bordered card, then again at up to 1200×900 in the lightbox. The source is a low-res catalogue image; at that size the barrel knurling is visibly soft and the edges are haloed. On mobile it occupies 640 of the first 1,000px. Worse, `ImageGallery.tsx` returns `null` when there are no images — so on 83% of lens pages the entire hero block, the carousel dots and the surrounding rhythm silently vanish and the page starts with a rating strip. **The no-image case is not designed; it is a hole.**

### The unlabelled 1–10 rating strip

Ten 44×44px grey squares numbered 1–10, floating with no label, no legend, no scale anchor, followed by 14px zinc "No ratings yet". Visually it reads as pagination. It is the second-heaviest element on the page after the hero, it sits directly above the specs, and on mobile it wraps to two rows (7 + 3) which makes the "pagination" reading almost certain. It is unclear whether it is input or output.

### Table styling

`table.tsx` is stock shadcn: `border-b` hairlines, `hover:bg-muted/50`, `h-10` heads, `whitespace-nowrap`, `p-2`. Consequences:

- Header cells are `font-medium text-foreground` at 14px — the same size and nearly the same weight as the data. There is no header/body contrast, so the header does not read as a header when scrolled.
- No `position: sticky` on `thead`; on a 494-row system table (22,231px per the audit) the column meaning is lost after one screen.
- No column alignment rules — text and numbers share left alignment.
- No sticky first column, so horizontal scroll on mobile detaches values from names.
- `SpecsTable` renders label cells at `w-1/3` in `text-zinc-500 dark:text-zinc-400` — hardcoded, contrast-failing (see §5), and 33% width means the label column is 380px wide on desktop with values orphaned far to the right.

### The home hero

`01-home-desktop.png`: a 1,740×360px rounded card containing a 48px centred display line, a 3-line 18px centred paragraph at ~85 characters, and three centred pills. It is a landing page for a product launch. It burns the entire first viewport and offers **no search field** — on a database whose primary job is lookup. Below it, four stat cards state "7,400+ lenses" while `/lenses` says 9,575. The "Most Popular Lenses" rail leads with `[Auto] Tamron-F 28mm F/2.8` at 127 views and a 10.0/10 `Zeiss N-Mirotar 210mm F/0.03`, with a `#1`–`#5` rank numeral set larger and lighter than the lens name itself.

### Dark-mode-by-default

`layout.tsx` sets `defaultTheme="system"`, and because most reviewers and a large share of visitors run dark OS themes, the *de facto* default is `oklch(0.145 0 0)` — near-black. For a reference site this is the wrong default on three counts: (a) long-form reading and dense tabular scanning are measurably worse on inverted polarity; (b) product photography of black lenses on near-black backgrounds loses all silhouette (compare the Sigma barrel, which merges into the card); (c) it signals "developer tool", not "encyclopedia". The light theme (`10-home-light.png`) is already the better-looking of the two — cleaner, more document-like, the black primary button finally reads as primary.

### What is good and worth keeping

1. **Geist Sans + Geist Mono.** Keep both. Geist's figures are excellent and the mono is a real companion, not an afterthought.
2. **The achromatic base itself.** `oklch(L 0 0)` is a genuinely good decision — the fix is to *add one accent*, not to add colour everywhere.
3. **The desktop lens table's interaction model** — sortable headers, click-a-cell-to-filter, URL-synced state, infinite scroll. Visually plain but structurally correct. Redesign the surface, not the behaviour.
4. **The price guide's three-cell Fair/Good/Excellent block.** The comparative-tile pattern is right and is a genuine differentiator; it just needs to be in a rail, not in the article flow.
5. **The sale-history scatter + trend chart.** Restrained, correct, no chartjunk. Keep it almost exactly as-is.
6. **The header.** 64px, sticky, backdrop-blurred, tight logo lockup, single-row nav. Only the greyed active-state pill needs work.
7. **Search results page** (`07-…png`) — the cleanest page on the site. Full-width input, grouped `Lenses (8)` heading, name + spec summary per row. Nearly right already.
8. **The chat answer layout** (`09-…png`) — readable measure, linked entities in blue. Notably: *this is the only place on the site where links are blue*, which proves the accent is needed everywhere else.
9. **`Edit / View history / Flag duplicate`** exist on every entity. The wiki skeleton is present; it is just typeset as a footer afterthought at 13px.

---

## 2. Reference-grade benchmarks — 12 transferable patterns

| # | Pattern | Source | What to take, concretely |
|---|---|---|---|
| 1 | **Infobox** | Wikipedia, MusicBrainz | A 320–360px right rail, `border: 1px`, `border-radius: 8px`, header bar with the entity name, then 18–24 label/value rows at 13px. Sits at the top-right of the article, *before* prose in DOM order on mobile. This alone converts "product page" → "encyclopedia entry". |
| 2 | **Dense definition list** | GSMArena, Apple tech specs | Rows at 32–36px, label left in `--fg-muted` at 12.5px, value right/left-aligned at 13.5px mono. GSMArena fits ~70 facts in one screen; you fit 22 in 900px. Group under real `<h2>`s (Optical / Physical / Focus / Mount & compatibility). |
| 3 | **Tabular numerals** | Apple, PCPartPicker, DPReview | `font-variant-numeric: tabular-nums` on every numeric cell, mono face for spec values. `$1,555.28` / `$690.01` must align on the decimal. Non-negotiable for a specs site. |
| 4 | **Consistent unit formatting** | DPReview, Apple | One canon: `85 mm`, `ƒ/1.4`, `630 g`, `0.85 m`, `1:8.3`, `⌀77 mm`. Currently the site mixes `85mm`/`f/1.4`/`F/1.4`/`f/1`/`F/2,8` (see the Zeiss Tessar `2,8/21`). Render units in `--fg-muted` at 0.9em so the magnitude reads first. Store SI, display dual (`119 × 74 × 45 mm (4.69 × 2.91 × 1.77 in)`) — the camera page already does this and it looks great. |
| 5 | **Section TOC** | Wikipedia (Vector 2022), Stripe docs | A sticky left rail on ≥1280px, or a collapsed "Contents" block on mobile. 13px, current section highlighted with a 2px accent bar. Essential once lens pages carry lead prose + history + compatibility + specs + variants. |
| 6 | **Breadcrumbs** | GSMArena, Discogs | `Lenses › Sigma › Art › 85mm F1.4 DG DN` at 13px, `--fg-muted`, `›` separators, last crumb unlinked. Replaces the current `← Back to lenses`, which is a browser-back button pretending to be information architecture. Emit matching `BreadcrumbList` JSON-LD. |
| 7 | **"Last updated" provenance line** | Wikipedia, MusicBrainz | Directly under the H1, 12.5px, muted: `Last edited 12 Aug 2026 by fsegouin · 4 revisions · 37 sale records · Cite this page`. This single line does more for perceived authority than any amount of visual polish. |
| 8 | **Citation superscripts** | Wikipedia | `[1]` superscripts at 0.7em in the link colour, attached to individual facts, resolving to a `## References` list. Attach them to the spec values you sourced from datasheets vs. the ones users entered. Pair with a `Sources` block in the infobox footer. |
| 9 | **Thumbnails in tables** | Discogs, PCPartPicker, GSMArena | A 40×40px (list) / 28×28px (compact) image cell as the first column. Turns a 9,575-row table from a spreadsheet into a catalogue — *and* it is exactly where the generated schematic placeholder (§3) pays off, because it works for the 83% without photos. |
| 10 | **Difference-highlighting compare tables** | PCPartPicker, GSMArena, DPReview | Rows where values are equal collapse to `--fg-muted`; rows that differ stay full-contrast, and the better value gets a subtle accent-tinted cell background (`accent @ 8%`) plus a delta (`−170 g`). A "Show differences only" toggle at the top. Compare is currently a two-select empty state with a placeholder icon. |
| 11 | **A–Z / faceted index hub** | Discogs label pages, MusicBrainz | The Systems hub should be a grouped index — `Canon` as an `<h2>`, then EF / EF-M / EF-S / FD / FL / R / RF as rows with lens counts and year ranges — not 132 uniform cards. A sticky A–Z rail on desktop. |
| 12 | **Entity card with a stable anatomy** | Discogs, GSMArena | One card component used everywhere (search, related, collections, most-popular): 48px thumb / name (15px, 1 line, ellipsis) / spec line (13px mono: `85 mm · ƒ/1.4 · 630 g`) / mount chip. Currently every surface invents its own row shape. |

---

## 3. Proposed direction: **"Field Notes"**

> A reference work typeset like a well-made technical manual: paper-white by default, one warm accent borrowed from lens coatings, numbers set in mono and locked to a grid, prose set to a comfortable measure, and photography treated as evidence rather than decoration. Nothing floats; nothing fades in. Every rule, every hairline, every chip earns its place by carrying information. The reader should feel they have arrived at *the record* of a lens — the page a forum post links to when it needs to settle an argument.

### 3.1 Typography

**Faces**
- **Geist Sans** — headings, UI, prose.
- **Geist Mono** — *all* spec values, all table numerics, all prices, all measurements, IDs, mounts. `font-variant-numeric: tabular-nums` globally on `.num`.
- Labels stay in Geist Sans. **The rule: names in sans, quantities in mono.** This is the single strongest typographic move available and it costs nothing — the font is already loaded.

**Scale** (16px root; desktop / mobile)

| Token | px | line-height | tracking | weight | Use |
|---|---|---|---|---|---|
| `--t-display` | 44 / 32 | 1.06 | −0.022em | 700 | Home hero only |
| `--t-h1` | 34 / 26 | 1.15 | −0.018em | 700 | Entity title |
| `--t-h2` | 22 / 20 | 1.25 | −0.012em | 600 | `Optical`, `Physical`, `History` |
| `--t-h3` | 17 / 16 | 1.35 | −0.006em | 600 | Sub-sections |
| `--t-prose` | 17 / 16 | 1.62 | 0 | 400 | Lead paragraph, article body |
| `--t-body` | 15 / 15 | 1.5 | 0 | 400 | Cards, descriptions |
| `--t-ui` | 14 / 14 | 1.45 | 0 | 500 | Nav, buttons, filters |
| `--t-fact` | 13.5 / 13.5 | 1.45 | 0 | 400 | Infobox + spec values (**mono**) |
| `--t-table` | 13.5 / 13.5 | 1.4 | 0 | 400 | Table cells |
| `--t-label` | 12.5 / 12.5 | 1.4 | 0.01em | 500 | Fact labels, captions |
| `--t-eyebrow` | 11.5 | 1.3 | 0.07em | 600 | Uppercase kickers only |

Kill the current pattern of using `--t-eyebrow` for section headings. `OPTICAL` becomes a real 22px `<h2>` with a 1px hairline rule beneath it.

**Line lengths**
- Prose / lead paragraph: **max 68ch (≈ 660px at 17px)**. Never full-bleed. This alone fixes the collection page.
- Infobox fact values: **max 34ch** before wrapping.
- Table cells: `Name` column `max-width: 340px` with ellipsis + `title` attr; everything else `nowrap`.
- Card descriptions: 2 lines, `-webkit-line-clamp: 2`, ~52ch.

### 3.2 Colour

Keep `oklch(L 0 0)` as the entire base. Add **one** accent.

**Candidate A — "Coating Amber" (recommended)**
```css
--accent:        oklch(0.62 0.14 68);   /* light mode: on white, 4.9:1 */
--accent-strong: oklch(0.52 0.15 62);   /* hover / pressed, 7.2:1 */
--accent-tint:   oklch(0.62 0.14 68 / 0.10);
/* dark mode */
--accent:        oklch(0.78 0.13 72);   /* on oklch(0.16), 9.4:1 */
--accent-tint:   oklch(0.78 0.13 72 / 0.14);
```
*Rationale.* Amber/brass is the one colour the subject matter actually owns: multicoating flare, brass helicoids, the warm cast of aged Takumar radioactive glass, the amber tint of a vintage catalogue page. It is warm against a neutral grey base, which makes the whole product feel like a document rather than a dashboard, and it is unclaimed — every competitor (DPReview, B&H, KEH, Lensrentals) is blue or red. It survives both polarities and sits far from the blue of the price chart, so data-viz and UI never collide.

**Candidate B — "Signal Blue"**
```css
--accent: oklch(0.50 0.17 254);  /* light, 6.8:1 on white */
--accent: oklch(0.74 0.14 250);  /* dark */
```
*Rationale.* Maximum familiarity — it is the Wikipedia/GSMArena link colour and needs zero user learning. *Against:* it is the default of every technical site on the internet, collides with the existing `--chart-*` blues, and makes the product indistinguishable from a hundred spec sites. Safe, forgettable.

**Candidate C — "Coating Cyan"**
```css
--accent: oklch(0.56 0.11 205);  /* light, 5.4:1 */
--accent: oklch(0.80 0.10 200);  /* dark */
```
*Rationale.* The literal colour of a modern multicoated front element viewed at an angle. Cool, precise, instrument-like — pairs beautifully with mono numerals. *Against:* low chroma at this lightness makes it read as "muted teal UI kit"; less distinct from the neutral base, so it does less work as an attention signal.

**Decision: A (Coating Amber), with a functional link blue.** One brand accent is right, but a reference site cannot use a warm accent for body-text links — amber underlines at 17px read as "visited" and fail contrast inside prose. So:

```css
/* light */
--link:          oklch(0.46 0.16 256);      /* 8.1:1 on white */
--link-visited:  oklch(0.44 0.13 300);
/* dark */
--link:          oklch(0.76 0.12 250);      /* 8.7:1 on oklch(0.16) */
--link-visited:  oklch(0.74 0.10 300);
```

Amber is *identity and state* (logo mark, active nav, focus ring, current filter, sort indicator, selected compare row, the TOC accent bar, "best value" cell tint). Blue is *navigation* (in-prose links). That is a semantic distinction, not a second brand colour, and it is exactly the split Wikipedia uses.

**Semantic set — deliberately small (four, not eleven):**
```css
--ok:      oklch(0.52 0.12 152) / dark oklch(0.76 0.13 150);  /* verified, in stock */
--warn:    oklch(0.60 0.13 85)  / dark oklch(0.80 0.12 88);   /* needs review, estimated */
--danger:  oklch(0.55 0.20 27)  / dark oklch(0.70 0.19 22);   /* duplicate, data conflict */
--info:    var(--link);
```
Everything else — mounts, formats, series, lens types — becomes **neutral**. Colour is reserved for *state*, never for *category*. If a category truly needs distinguishing, use shape and weight (outline vs solid vs mono), not hue.

**Surfaces** (light default)
```css
--bg:        oklch(0.995 0 0);   /* paper, not pure white */
--bg-subtle: oklch(0.975 0 0);   /* infobox, table header */
--bg-sunken: oklch(0.955 0 0);   /* image wells, empty states */
--fg:        oklch(0.20 0 0);
--fg-muted:  oklch(0.46 0 0);    /* 7.4:1 — replaces zinc-500 */
--fg-faint:  oklch(0.58 0 0);    /* 4.7:1 — minimum permitted */
--rule:        oklch(0.90 0 0);
--rule-strong: oklch(0.82 0 0);
```
Dark mode lifts off pure black: `--bg: oklch(0.175 0 0)`, `--bg-subtle: oklch(0.215 0 0)`, `--fg-muted: oklch(0.72 0 0)`. Near-black (`0.145`) crushes black lens barrels; `0.175` gives product photography a silhouette.

**Light as the default.** `defaultTheme="light"`, toggle preserved, `prefers-color-scheme` respected only after an explicit "System" choice. Reasons: (1) dense tabular scanning and long prose are the two things this site exists for, and both are worse in inverted polarity; (2) product photography — the entire imagery strategy — needs a light ground; (3) a link from a forum or a Google result should land on something that looks like a reference page, and every reference the web trusts is light-first; (4) OG/social preview images and print/PDF citation both assume light. Dark mode stays first-class — but it is the option, not the identity.

### 3.3 Layout grid

**Shell:** `max-width: 1200px`, padding `24px` / `32px` (≥768) / `40px` (≥1280). Reduce from the current 1280 — 1200 gives a better table measure and a stronger sense of "page".

**Lens article, ≥1024px** — two columns:
```
[ TOC 180px ] [ gutter 40 ] [ article  min 620 / max 720 ] [ gutter 48 ] [ rail 344 ]
```
On 1024–1279px drop the TOC (it becomes an inline "Contents" disclosure above the lead). Rail is `position: sticky; top: 80px` (64px header + 16px), `max-height: calc(100vh - 96px)`, `overflow-y: auto`.

Rail contents, in order: **Infobox** (the specs summary) → **PriceRail** (Fair/Good/Excellent + rarity + "based on N sales") → **eBay listings** (collapsed to 3) → **Provenance / Sources**. The article column carries: breadcrumb → H1 → provenance line → lead paragraph → hero image → full spec sections → compatibility → variants → history → references → related.

**Mobile (<768px)** — single column, and **the infobox comes first**:
```
breadcrumb → H1 → provenance → Infobox (key 8 facts, "Show all 24 specs") →
hero image → lead paragraph → full specs → compatibility → price guide →
eBay (collapsed) → related
```
The price guide and eBay drop below the specs on mobile. This is the single highest-leverage layout change on the site.

**Other maxima:** prose column `660px`; tables full shell width; home hero content `760px`; search results `860px`; forms `560px`.

### 3.4 Components to add

| Component | Anatomy & exact values |
|---|---|
| **`Infobox`** | 344px (desktop) / full-width (mobile). `border: 1px solid --rule`, `radius: 8px`, `bg: --bg-subtle`. Header: 40px bar, `--t-label` uppercase, `bg: --bg-sunken`, bottom hairline. Body: `FactRow`s. Footer: `Sources ▾` + `Last verified`. Max 12 rows before a `Show all` disclosure. |
| **`Breadcrumb`** | 13px `--fg-muted`, `›` separators at 60% opacity, `gap: 6px`, 32px tall, last item `--fg`, unlinked. Truncate middle crumbs to `…` below 480px. Emits `BreadcrumbList` JSON-LD. |
| **`SectionNav` / TOC** | 180px sticky rail, 13px, `line-height: 2`, items `--fg-muted`, current item `--fg` + `border-left: 2px solid --accent` at `padding-left: 12px`. IntersectionObserver-driven, `scroll-margin-top: 88px` on headings. |
| **`FactRow`** | `display: grid; grid-template-columns: 140px 1fr; gap: 16px; padding: 8px 0; border-bottom: 1px solid --rule`. Label: `--t-label`, `--fg-muted`, sans. Value: `--t-fact`, mono, `tabular-nums`, `--fg`. Units in `<span class="unit">` at `0.88em` `--fg-muted` with a `0.15em` space. Handles `—` for unknown (never blank, never "N/A"). Optional trailing `CitationMark`. |
| **`CitationMark`** | `<sup>` `0.68em`, `--link`, `padding: 0 2px`, target `[1]`. Hover → popover with source name + date. `:target { background: --accent-tint }` for 1.2s. |
| **`ProvenanceLine`** | 12.5px `--fg-muted`, `·` separators, under H1 with `margin-top: 8px`. `Last edited {date} by {user} · {n} revisions · {n} sale records · Cite`. This is the trust signal — it must be on every entity page. |
| **`CompareTray`** | Fixed bottom bar, `height: 72px`, `bg: --bg` + `backdrop-filter: blur(12px)`, `border-top: 1px solid --rule-strong`. Up to 4 slots of 48px thumb + name, `×` to remove, primary `Compare (3)` right-aligned. Appears when ≥1 item is checked from any list. `translateY(100%)` → `0` over 180ms. |
| **`EntityCard`** | Two densities. *Row* (48px thumb, 15px name, 13px mono spec line, mount chip, 64px tall). *Tile* (4:3 image, 15px name, 13px spec line, 220px wide). One component, `variant="row" \| "tile"`. Replaces the five bespoke row shapes in use today. |
| **`FilterDrawer`** | Mobile: bottom sheet at 88vh, 56px header (`Filters` / `Reset`), grouped sections, sticky 64px footer `Show 1,204 lenses`. Trigger is a 44px `Filters (3)` button in a sticky sub-header. Replaces the 13 stacked controls. Desktop: inline, collapsed to one row + `More filters`. |
| **`AppliedFilterChips`** | 28px chips, `bg: --accent-tint`, `border: 1px solid --accent @ 40%`, 13px, `×` at 14px with a 24px hit area. Row beneath the search field, plus `Clear all`. |
| **`EmptyState`** | Centred, `max-width: 480px`, `padding: 64px 24px`. 32px line-icon at `--fg-faint`, 17px headline, 15px `--fg-muted` explanation, then **suggestions** — for a failed search, 3–5 `EntityCard` rows of near-matches plus "Did you mean *summicron*?" in `--link`. Never a bare icon + sentence, which is what Compare shows today. |
| **`StatusBadge`** | The *only* coloured badge. `Verified` (`--ok`), `Needs review` (`--warn`), `Possible duplicate` (`--danger`), `Estimated` (`--warn`, outline). 20px, `radius: 4px` (not pill — pills read as tags, squares read as state), 11.5px uppercase, 0.06em tracking. |
| **`MountBadge`** | Neutral. `border: 1px solid --rule-strong`, transparent bg, `--fg`, mono 12px, `radius: 4px`, `padding: 2px 6px`, 20px tall. A 3px leading colour bar is permitted *only* if deterministically derived from the mount slug and capped at `chroma 0.06` — otherwise omit. Multi-mount renders side by side with a `+2` overflow chip. |

Also retire: the 11 badge variants (→ `MountBadge` + `StatusBadge` + a neutral `Tag`), and `page-transition.tsx`.

### 3.5 Density & spacing tokens

```css
/* base unit 4px */
--sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
--sp-5: 24px; --sp-6: 32px; --sp-7: 40px; --sp-8: 56px; --sp-9: 80px;

/* prose rhythm */
--prose-para:      16px;   /* p + p */
--prose-h2-top:    40px;
--prose-h2-bottom: 12px;
--prose-h3-top:    28px;
--section-gap:     56px;   /* desktop */  /* 40px mobile */

/* tabular rhythm — two densities, user-togglable */
--row-compact:      34px;  --cell-y-compact:  6px;
--row-default:      42px;  --cell-y-default: 10px;
--cell-x:           12px;  /* up from the current 8px */
--head-h:           40px;
--rule-w:           1px;
--fact-row-y:       8px;   /* infobox / SpecsTable */
--fact-label-w:   140px;
```

Rules: **tables get horizontal padding, prose gets vertical rhythm.** Table rows never exceed `--row-default` — if a cell needs two lines (the `Prime`/`Macro` stack today), truncate and show overflow in a tooltip. Spec sections use `--fact-row-y: 8px` and no zebra striping; a 1px `--rule` hairline is enough, and `hover: --bg-subtle` gives the row-tracking zebra would.

### 3.6 Imagery rules

1. **Never upscale.** `max-height: 420px` (desktop) / `320px` (mobile), `width: auto`, `object-fit: contain`. If the source is below 800px on its long edge, cap display at intrinsic width and show a `Low-resolution source` note at 12px muted. The current 620×470 render of a small catalogue JPEG is the most visible quality tell on the site.
2. **Fixed aspect well.** All image containers `aspect-ratio: 4/3`, `bg: --bg-sunken`, `border: 1px solid --rule`, `radius: 8px`, `padding: 24px`. Products sit *in* a well, not *on* a card. Zero CLS, consistent rhythm regardless of photo orientation.
3. **Light ground even in dark mode.** Product wells stay `oklch(0.93 0 0)` in dark mode. A black lens on `oklch(0.20)` is unreadable; a black lens on light grey is a photograph.
4. **Thumbnails**: 48px list / 28px compact / 40px eBay card, all `object-fit: contain` on `--bg-sunken`, `radius: 4px`.
5. **Attribution**: 12px caption below every hero — `Manufacturer press image` / `© user, CC BY-SA 4.0` / `Source: {domain}`. Reference works cite their pictures.
6. **Carousel dots only when >1 image**; today a single-image lens still shows the dot rail and both chevrons.

**The no-image system — "Optical Schematic Tiles"** (a first-class design surface, not a fallback)

83% of lenses have no photo. A grey box repeated 8,000 times is a visible admission of emptiness. Instead, generate a deterministic SVG from data the record already has:

*Large tile (hero, 4:3, ~520×390):* a **cross-section optical schematic**, drawn programmatically:
- Draw `elements` lens-element outlines, clustered into `groups` (gaps between groups 3× the gaps within). This is real information: an 11-element/8-group design *looks* different from a 4/3 Tessar.
- Barrel length ∝ `focal_length` on a log scale (8mm → 0.35 of tile width, 800mm → 0.95); barrel diameter ∝ `filter_size`.
- Front-element diameter ∝ `focal_length / f-number` (the actual entrance pupil) — so an ƒ/1.2 50mm visibly has a bigger front element than an ƒ/2.8 50mm. That is *correct optics*, and enthusiasts will notice.
- Stroke `--fg-muted` at 1.25px, elements filled `--accent-tint`, an aperture symbol at the diaphragm position with `blade_count` blades.
- Caption beneath, 12px: `Schematic generated from published specifications · No photograph yet — contribute one`.

*Small tile (48px / 28px, lists and tables):* a **monogram chip** — brand initial(s) in Geist Mono at 15px `--fg-muted`, over an iris ring whose blade count = `diaphragm_blades ?? 7` and whose stroke weight steps with the aperture band (ƒ/≤1.4 heaviest → ƒ/≥5.6 lightest). Focal length as a 9px mono numeral bottom-right. Background `--bg-subtle`. At 28px only the iris ring and numeral survive — still more informative and more attractive than grey.

*Tiering:* if a lens lacks even elements/groups, fall back to the monogram at hero size. If it lacks *everything*, show the iris ring alone with `Specifications incomplete — help complete this record` linking to `/submit`. **There is never a blank grey box, and every empty state is a contribution prompt.** This turns the site's biggest data weakness into its most distinctive visual signature — a page of schematic tiles is instantly recognisable as thelensdb.com.

### 3.7 Motion

**Remove**
- `page-transition.tsx` entirely. A 250ms opacity fade on every navigation delays first paint of a server-rendered page for zero benefit — and it is why `01-home-mobile.png` was captured half-transparent. Reference sites do not fade in.
- Any `transition-all` (currently on `badge.tsx`) — it animates layout properties and costs paint.
- The lightbox `AnimatePresence` cross-fade between images; make it instant.

**Keep / add** (all ≤180ms, all `prefers-reduced-motion` guarded)
- Hover/focus: `transition: background-color 120ms, border-color 120ms, color 120ms`.
- Table row hover: 100ms background only.
- `CompareTray` slide-in: 180ms `cubic-bezier(0.16, 1, 0.3, 1)`.
- Disclosure/accordion height: 160ms ease-out.
- Skeletons: keep, but as a static `--bg-subtle` block with a 1.4s low-contrast shimmer, not a pulse.
- Sticky header shadow appearing past 8px scroll: 120ms.

Nothing on the page should move that the user did not cause.

---

## 4. Page-by-page visual notes

### Home
Replace the marketing hero with a **lookup hero**. The single most important element on a reference site's front door is a search field, and there isn't one. Kill the 360px card, the centred 3-line paragraph, and the three pills. New hero: 32px wordmark line, one 15px sentence at ≤72ch, a **56px full-width search input** (`max-width: 640px`, 17px, mono placeholder `Try "Canon EF 50mm f/1.8" or "85mm portrait"`), and beneath it a single row of 13px quick facts — `9,575 lenses · 2,187 cameras · 132 systems · updated daily` — replacing the four stat cards entirely (they consume 300px to say what one line says, and their numbers are wrong). Total hero height ≤ 280px.

Below: three sections at `--section-gap`, each with a real 22px `<h2>` and a `View all →` link — **Browse by system** (a compact 4-column list of the top 16 mounts with lens counts, not cards), **Recently updated** (a provenance signal — 6 `EntityCard` rows with edit timestamps), **Collections** (6 tiles). Drop "Most Popular Lenses" until view counts are meaningful; ranked by 127 views it actively damages credibility, and the `#1`–`#5` numerals are currently louder than the lens names.

### Lens article
The whole redesign in one page. Order per §3.3. Specifics:
- Breadcrumb replaces `← Back to lenses`.
- H1 34px, then `ProvenanceLine`, then a 17px/1.62 **lead paragraph** at 660px — even a generated two-sentence lead (`The Sigma 85 mm ƒ/1.4 DG DN Art is a full-frame short-telephoto prime introduced in 2020 for Sony E and Leica L mounts. It replaced the 2016 DG HSM design with a 630 g body, less than half the weight.`) transforms the page's character.
- Badge row → one `MountBadge` group + `Full Frame` + `Prime` as neutral tags, 20px, single row, no colour.
- Hero image in a 4:3 well, `max-height: 420px`, captioned and attributed.
- **Rating strip**: shrink to 32×32px squares, `radius: 4px`, prefix with a 13px label `Rate this lens`, suffix `1 = poor · 10 = exceptional`, and move it below the specs, above References. When ratings exist, lead with the aggregate (`7.8` in 28px mono + `· 42 ratings` + a 4px distribution bar) and put the input behind a `Rate` button.
- **Specs**: real `<h2>`s (`Optical`, `Focus`, `Physical`, `Mount & compatibility`), `FactRow`s at 140px label / mono value, units styled, `—` for unknown. Fix the label column from `w-1/3` (380px) to a fixed 140px.
- Price guide, chart and eBay move to the sticky rail (desktop) / below specs (mobile), under an explicit `Market data` heading with the affiliate disclosure at 12px directly beneath it — not 3,000px away in the footer.
- Add `Variants`, `Related`, `References` sections and a `Cite this page` affordance.

### Camera article
Structurally identical to the lens article — reuse every component. From `04-camera-detail-full.png`: the `Format: XF-AVC / H.264 / H.265` multi-line value is the one place `SpecsTable`'s list-splitting works well — keep it, but render as inline `·`-separated mono chips rather than a bare `<ul>`. `Dimensions: 119 × 74 × 45 mm (4.69 × 2.91 × 1.77")` is the best-formatted value on the site; make it the template for the unit-formatting rule. Add the missing links: mount → system hub, and a `Lenses for this camera (N)` block — the single highest-value cross-link on the site, and it currently does not exist.

### System hub
Stop using cards. `05-systems-desktop.png` shows 132 uniform 200px tiles where "Canon Mirror Box 2" and "Sony E" get identical visual weight. Replace with a **grouped index**: manufacturer as a 22px `<h2>`, then rows — `Canon EF · 1987–2018 · 384 lenses · 41 cameras` — at 42px with a mono count column right-aligned. Sticky A–Z rail on the right at ≥1024px. Weight the row name by inventory (`600` above 100 lenses, `400` below) so important mounts surface without colour. A system *detail* page gets a lead paragraph, an infobox (introduced / discontinued / flange distance / diameter / successor), and its lens table **paginated and filterable** — never 494 rows in one 22,000px scroll.

### Lens list — desktop table
Keep the interaction model; rebuild the surface. Add a 40px thumbnail column (schematic tile for the 83%). Header: `--bg-subtle`, `position: sticky; top: 64px`, 12.5px uppercase `--fg-muted` `600` — genuinely distinct from 13.5px body. Right-align and set in mono: Focal Length, Aperture, Year, Avg Price, Weight, Rating. Left-align: Name, Brand, System, Type, Series. Sort indicator = a filled `--accent` caret, not a grey double-chevron. Type/Series badges → neutral 12px mono tags; the current green/indigo rainbow across 9,575 rows is the loudest thing on the page and carries the least information. Filters collapse from 13 always-visible controls to `[search] [System ▾] [Brand ▾] [More filters (0)]` plus an `AppliedFilterChips` row. Row height 42px, `--cell-x: 12px`. Add a `Density` toggle (34/42px) in the table header — this audience wants it.

### Lens list — mobile
A card list, not a squeezed table. Sticky sub-header: 44px search + 44px `Filters (n)` opening the `FilterDrawer`. Then `EntityCard variant="row"` at 76px each — see §7. Sort as a 40px segmented control (`Name · Year · Price · Weight`). Infinite scroll with a 13px `Showing 60 of 9,575` counter. If the table must survive, sticky the name column and set `min-width: 140px` on it.

### Compare
Currently an empty two-select page with a placeholder icon (`08-…png`) — a dead end that gives no reason to proceed. Redesign: the empty state shows **three pre-built comparisons** as clickable cards (`Canon RF 50 ƒ/1.2 vs Sigma 50 ƒ/1.2 · Sony 24-70 GM I vs II · Nikon 85 ƒ/1.8 S vs ƒ/1.2 S`), plus "or add from any list". Once populated: a sticky header row with 120px images and names; `FactRow`s in a 3-column grid (`140px | 1fr | 1fr`); equal values drop to `--fg-muted`; differing values stay `--fg` and the winning cell gets `bg: --accent-tint` + a mono delta (`−170 g`, `+1 stop`); `Show differences only` toggle; a shareable URL. On mobile, two columns with a sticky 100px label column.

### Search results
The strongest page — small changes only. Add `Cameras` and `Systems` groups (the header says it searches all three), keep the count chips, add a 40px thumbnail to each row, and replace the inline grey `50mm f/2.5` with a 13px mono spec line beneath the name (`85 mm · ƒ/1.4 · 630 g · Sony E`). Reduce row height from 80px to 64px. Zero-result state gets `EmptyState` with fuzzy suggestions — `sumicron` returning nothing with no "did you mean" is the worst single moment in the product.

### Collection page
Currently broken, not merely ugly (`06-collection-pancake.png`): ~110-character lines, paragraphs run together (`weight.First pancake…`), a "QUICK JUMP TO" index rendered inline as body text, every lens entry concatenated with `•` glyphs, zero headings, zero images. Fix: parse the source into structure and render a real article — 660px prose measure, 17px/1.62, `--prose-para: 16px`; the quick-jump index becomes a `SectionNav`; each system becomes an `<h2>` with an `EntityCard` grid beneath. This page has the best editorial content on the site and the worst typography; it should be the showcase.

### 404
Currently the bare Next.js default with no nav. Give it the shell (header + footer), a 32px `Page not found`, a 15px muted line, a 48px search field, and four links — `Browse lenses · Browse cameras · Systems · Home`. If the URL contains a plausible slug, fuzzy-match it and surface `Did you mean Canon EF 50mm ƒ/1.8 STM?` as an `EntityCard`.

### Footer
Currently two centred grey sentences with no links — a dead end at the bottom of every page. Rebuild as a 4-column `max-width: 1200px` block at 13px: **Browse** (Lenses / Cameras / Systems / Collections / Compare) · **Contribute** (Submit · Edit guidelines · Recent changes · Report an issue) · **About** (About · Data sources · Licence · Cite) · **Legal** (Privacy · Affiliate disclosure · Contact). Bottom bar: wordmark, `Content licensed CC BY-SA 4.0`, `Last database update: {date}`. The licence line and the recent-changes link are what make a site feel citable. Fix the `text-zinc-400` disclosure, which fails contrast badly in light mode (§5).

---

## 5. Accessibility & polish

**Contrast failures (measured against the tokens in the repo)**
- `layout.tsx` footer: `text-zinc-500` (`#71717a`) on the dark background ≈ **4.05:1** at 14px → fails AA (needs 4.5:1). The second line, `text-zinc-400` (`#a1a1aa`) at 12px, on **light** mode's white ≈ **2.6:1** → fails badly. This is the affiliate disclosure — a legal notice rendered below the legibility threshold.
- `SpecsTable.tsx` label column: `text-zinc-500 dark:text-zinc-400` — the *labels of every specification on the site* sit at ~4.05:1 in dark mode.
- Card body copy on the home and Systems pages, and the `2 views` / `No ratings yet` / `Based on recent eBay sales` micro-copy, are all in the same failing greys.
- **Root cause is structural, not incidental:** 1,081 hardcoded `zinc-*` classes vs 179 semantic token usages. The tokens themselves are fine — `--muted-foreground` is `oklch(0.708)` ≈ 9.6:1 in dark mode and passes comfortably. Every contrast failure on the site comes from a hardcoded zinc bypassing a token that would have been correct. Fix: define `--fg-muted` (7.4:1) / `--fg-faint` (4.7:1 floor) and codemod `zinc-500|zinc-400|zinc-600` → those two. One mechanical change closes essentially the whole contrast backlog.
- Badge variants use `*-50/*-700` (light) and `*-900/30 ÷ *-300` (dark). The dark combinations land around 6–7:1 and pass; `text-blue-700` on `bg-blue-50` is ~7.9:1 and fine — the problem here is meaning, not contrast. Retiring nine of the eleven variants solves both.

**Tap targets**
- Table rows are ~36px effective (`p-2` + 14px text) and rows are clickable — below the 44px minimum. Mobile rows must be ≥44px; the proposed 76px `EntityCard` fixes it outright.
- Sort affordances in `<th>` are ~16px chevron glyphs with no padded hit area. Make the whole `<th>` the button, `min-height: 40px`.
- Carousel chevrons in `ImageGallery` render ~32px; the lightbox close button is correctly `h-11 w-11` — apply that everywhere.
- Badge height is hard-coded `h-5` (20px). Fine as a static label; if a badge is ever a filter link it needs a 44px hit area via padding or a wrapping anchor.
- `AppliedFilterChips` `×` needs a 24px hit box minimum, 32px preferred.

**Focus states**
- Global is `outline-ring/50` with `--ring: oklch(0.556 0 0)` — **a 50%-opacity mid-grey ring on a grey UI**, effectively invisible against `--bg-subtle` cards and table rows. Replace with `outline: 2px solid var(--accent); outline-offset: 2px;` on `:focus-visible` for every interactive element. This is the single best use of the new accent and the clearest keyboard-accessibility win.
- `badge.tsx` uses a 3px `ring-ring/50` — same problem.
- Add a `Skip to content` link (visually hidden until focused) — mandatory once a 13-item filter bar and a TOC sit between the header and the first result.
- Ensure focus survives the sticky header: `scroll-margin-top: 88px` on all focusable landmarks and headings.

**Heading hierarchy**
- Section "headings" (`PRICE GUIDE`, `OPTICAL`, `PHYSICAL`, `EBAY LISTINGS`) are 12px uppercase micro-labels. Whether or not they are `<h2>` elements, they are typographically ranked *below* body text, which breaks visual hierarchy for sighted users and is an accessibility smell besides. Promote to real 22px `<h2>` with a hairline rule.
- The collection page has **zero headings** in a 900-word article. Screen-reader navigation of the site's best content is impossible.
- Home: verify the `#1`–`#5` rank numerals are not headings; they are currently the largest text in that block, a visual-hierarchy inversion regardless of markup.
- The 404 page has no `<h1>` and no landmarks at all.
- Every table needs a `<caption class="sr-only">` and `scope="col"` on headers.
- Decorative icons (the four home stat-card icons, the compare empty-state arrows) need `aria-hidden="true"`; schematic placeholder tiles need a real `alt` — `Optical schematic: 11 elements in 8 groups, 85 mm ƒ/1.4. No photograph available.`

---

## 6. Roadmap

### Do in one week — 10 visual changes with outsized effect

1. **Flip the default to light.** `defaultTheme="light"` in `layout.tsx`, keep the toggle and a "System" option. Lift dark-mode `--background` from `oklch(0.145)` to `oklch(0.175)` at the same time so black lenses have a silhouette. *Instantly changes what kind of site this is.*
2. **Delete `page-transition.tsx`.** Removes a 250ms opacity delay on every navigation and a whole class of half-rendered states.
3. **Codemod `zinc-500` / `zinc-400` / `zinc-600` → `--fg-muted` / `--fg-faint`** (two new tokens at 7.4:1 and 4.7:1). Closes the contrast backlog and cuts ~700 of the 1,081 hardcoded classes in one commit.
4. **Mono + tabular numerals on every quantity.** `font-mono tabular-nums` on all `SpecsTable` values, price-guide figures, eBay prices, and the Focal Length / Aperture / Year / Avg Price / Weight / Rating columns — right-aligned. Highest visual-credibility-per-line-of-diff on this list.
5. **Promote section headings.** `PRICE GUIDE` / `OPTICAL` / `PHYSICAL` → 22px/600 `<h2>` with a `1px --rule` beneath and `--section-gap: 56px`. Costs nothing, reorders the whole page's perceived hierarchy.
6. **Cap the hero image.** `max-height: 420px`, `width: auto`, `object-contain`, in a `4/3` `--bg-sunken` well with a light ground in both themes. Kills the upscaling artefacts and the variable heights.
7. **Collapse the badge palette from 11 hues to 2 + neutral.** `StatusBadge` (four semantic states) and `MountBadge`/`Tag` (neutral, mono, 4px radius). Removes the rainbow under every H1 and across 9,575 table rows.
8. **Breadcrumbs replace `← Back to lenses`** on lens, camera and system pages. 13px, `›`, muted. Three lines of JSX; enormous signal.
9. **Accent focus ring.** `--ring: var(--accent)`, `outline: 2px solid; outline-offset: 2px` on `:focus-visible` globally. Introduces the accent and fixes keyboard accessibility in the same change.
10. **`ProvenanceLine` under every H1.** `Last edited {date} · {n} revisions · {n} sale records`. The data already exists behind `View history`. Nothing else on this list buys as much perceived authority per pixel.

*(Number 11, if there is room: move `SpecsTable` above the price guide in the DOM. It is a reorder rather than a restyle, but it is the change that most changes what the page* is.*)*

### Design system v2 — full redesign

**Tokens**
- Restructure into three layers: *primitive* (`--grey-0…12`, `--amber-3…11`, `--blue-4…10` as oklch ramps), *semantic* (`--bg`, `--bg-subtle`, `--bg-sunken`, `--fg`, `--fg-muted`, `--fg-faint`, `--rule`, `--rule-strong`, `--accent`, `--accent-strong`, `--accent-tint`, `--link`, `--link-visited`, `--ok`, `--warn`, `--danger`), *component* (`--infobox-bg`, `--table-head-bg`, `--fact-label-w`).
- Type scale as tokens (§3.1) with a mobile clamp; `--t-*` used everywhere, no ad-hoc `text-[13px]`.
- Spacing/density tokens (§3.5) including the compact/default table switch.
- Radius: reduce `--radius` from `0.625rem` (10px) to `0.5rem` (8px), and use 4px for chips/badges/thumbnails. 10px everywhere is what makes it read as "app".
- Elevation: **abolish shadows entirely.** Reference works use rules, not shadows. One exception: the sticky header's `0 1px 0 --rule` on scroll, and the `CompareTray`.
- A lint rule banning raw `zinc-*`, `blue-*`, `green-*` etc. in `src/` outside `globals.css`. Without enforcement the 1,081 come back.

**Components** — build the 13 in §3.4, plus: `Table` v2 (sticky head, alignment props, density prop, sticky first column, `<caption>`), `SpecSection`, `LeadParagraph`, `SchematicTile` + `MonogramChip` (the generated-placeholder pair), `PriceRail`, `AffiliateNotice`, `SourceList`, `CiteDialog`, `RecentChanges` feed, `DensityToggle`, `SkipLink`, `ZeroResult` (fuzzy suggestions).

**Foundations** — an imagery spec (wells, grounds, attribution, resolution floors, placeholder tiers); a unit-formatting utility (`formatMm`, `formatAperture`, `formatWeight`, `formatDimensions`, `formatMagnification`) so `f/1.4`/`F/1.4`/`ƒ/1.4` can never diverge again; a motion spec (≤180ms, `prefers-reduced-motion`, no entrance animations); a content style guide (sentence case except `--t-eyebrow`, `—` for unknown, `·` as separator, `×` for dimensions, thin space before units); a print stylesheet (a citable reference page must print well); and a redesigned OG image template using the light theme + the schematic tile, since that is what appears in every social and Slack unfurl.

---

## 7. Wireframes

### Lens article — desktop (≥1280px, 1200px shell)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ THE LENS DB    Systems  Lenses  Cameras  Collections  Compare  Submit   ⌕ ☾ ⋮    │ 64
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ ┌─ TOC 180 ─┐ ┌────────── article 720 ──────────┐ ┌──── rail 344 (sticky) ────┐  │
│ │           │ │ Lenses › Sigma › Art › 85mm ƒ1.4│ │┌─────────────────────────┐│  │
│ │▌Overview  │ │                                 │ ││ SPECIFICATIONS          ││  │
│ │ Optical   │ │ Sigma 85 mm ƒ/1.4 DG DN Art     │ ││─────────────────────────││  │
│ │ Focus     │ │ ◀34px/700                       │ ││ Focal length     85 mm  ││  │
│ │ Physical  │ │ Last edited 12 Aug 26 · 4 revs  │ ││ Max aperture    ƒ/1.4[1]││  │
│ │ Mount     │ │ · 37 sale records · Cite  ◀12.5 │ ││ Min aperture     ƒ/16   ││  │
│ │ Variants  │ │                                 │ ││ Elements/groups  11 / 8 ││  │
│ │ History   │ │ [Sony E][Leica L] Full Frame    │ ││ Min focus       0.85 m  ││  │
│ │ Sources   │ │ Prime  ◀ all neutral, 20px      │ ││ Magnification   1:8.3   ││  │
│ │ Related   │ │                                 │ ││ Filter          ⌀77 mm  ││  │
│ │           │ │ The Sigma 85 mm ƒ/1.4 DG DN Art │ ││ Weight           630 g  ││  │
│ │           │ │ is a full-frame short-telephoto │ ││ Introduced        2020  ││  │
│ │           │ │ prime introduced in 2020 for    │ ││ Status      In produc.  ││  │
│ │           │ │ Sony E and Leica L. It replaced │ ││          Show all 24 ▾  ││  │
│ │           │ │ the 2016 DG HSM at half the     │ │└─────────────────────────┘│  │
│ │           │ │ weight.  ◀17px/1.62, 68ch max   │ │┌─────────────────────────┐│  │
│ │           │ │                                 │ ││ MARKET DATA             ││  │
│ │           │ │ ┌─────────────────────────────┐ │ ││ Fair    Good    Excel.  ││  │
│ │           │ │ │      4/3 well, ≤420px       │ │ ││ $635–   $671–   $580–   ││  │
│ │           │ │ │      bg --bg-sunken         │ │ ││ 675     740     700     ││  │
│ │           │ │ │      never upscaled         │ │ ││ ◀ mono, tabular         ││  │
│ │           │ │ └─────────────────────────────┘ │ ││ Common · 37 sales/90 d  ││  │
│ │           │ │ Sigma press image · CC BY  ◀12  │ ││ ┌───── chart 300×120 ──┐││  │
│ │           │ │                                 │ ││ └──────────────────────┘││  │
│ │           │ │ ── Optical ──────────── ◀22/600 │ ││ 6 listings on eBay ▾    ││  │
│ │           │ │  Focal length          85 mm    │ ││ Affiliate disclosure    ││  │
│ │           │ │  Max aperture         ƒ/1.4     │ │└─────────────────────────┘│  │
│ │           │ │  Elements / groups     11 / 8   │ │┌─────────────────────────┐│  │
│ │           │ │  ◀140px label │ mono value      │ ││ SOURCES                 ││  │
│ │           │ │                                 │ ││ [1] Sigma datasheet '20 ││  │
│ │           │ │ ── Physical ──────────────────  │ ││ [2] DPReview, Mar 2021  ││  │
│ │           │ │  Weight                 630 g   │ │└─────────────────────────┘│  │
│ │           │ │  Filter                ⌀77 mm   │ │                           │  │
│ │           │ │                                 │ │                           │  │
│ │           │ │ ── Mount & compatibility ────── │ │                           │  │
│ │           │ │ ── Variants ────────────────── │ │                           │  │
│ │           │ │ ── Rate this lens ──────────── │ │                           │  │
│ │           │ │  [1][2][3]…[10]  1=poor 10=exc. │ │                           │  │
│ │           │ │ ── Related ─────────────────── │ │                           │  │
│ │           │ │ Edit · History · Flag duplicate │ │                           │  │
│ └───────────┘ └─────────────────────────────────┘ └───────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Lens article — mobile (375px) — infobox first

```
┌───────────────────────────────┐
│ THE LENS DB      ⌕   ☾   ☰    │ 56
├───────────────────────────────┤
│ Lenses › Sigma › 85mm ƒ1.4  ◀ 13px, middle crumbs → …
│                               │
│ Sigma 85 mm ƒ/1.4             │ 26px/700
│ DG DN Art                     │
│ Last edited 12 Aug · 4 revs   │ 12.5 muted
│ [Sony E][Leica L] Full Frame  │ neutral, 20px
│                               │
│ ┌───────────────────────────┐ │
│ │ SPECIFICATIONS            │ │ ◀ INFOBOX FIRST
│ │ Focal length       85 mm  │ │   8 key facts
│ │ Max aperture      ƒ/1.4   │ │   mono values
│ │ Elements/groups    11 / 8 │ │   right-aligned
│ │ Min focus         0.85 m  │ │
│ │ Filter            ⌀77 mm  │ │
│ │ Weight             630 g  │ │
│ │ Introduced          2020  │ │
│ │        Show all 24 specs ▾│ │
│ └───────────────────────────┘ │
│                               │
│ ┌───────────────────────────┐ │
│ │   4/3 well · ≤320px tall  │ │
│ │   photo OR schematic tile │ │
│ └───────────────────────────┘ │
│ Sigma press image · CC BY     │
│                               │
│ The Sigma 85 mm ƒ/1.4 DG DN   │ 16px/1.6
│ Art is a full-frame short-    │
│ telephoto prime introduced…   │
│                               │
│ ── Optical ─────────────────  │ 20px/600
│  Focal length        85 mm    │
│  Max aperture       ƒ/1.4     │
│ ── Physical ────────────────  │
│ ── Compatibility ───────────  │
│                               │
│ ── Market data ─────────────  │ ◀ BELOW specs
│  Fair    Good    Excellent    │
│  $635–   $671–   $580–700     │
│  6 eBay listings ▾ (collapsed)│
│  Affiliate disclosure   ◀12px │
│                               │
│ ── Rate this lens ──────────  │
│ ── Related ─────────────────  │
└───────────────────────────────┘
```

### Home hero — desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ THE LENS DB    Systems  Lenses  Cameras  Collections  Compare  Submit   ⌕ ☾ ⋮    │ 64
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │ 40
│              The camera lens database                        ◀ 44px/700/−0.022em │
│              Specifications, mounts and market prices for     ◀ 15px muted, 72ch │
│              every interchangeable lens ever made.                               │
│                                                                                  │ 24
│        ┌──────────────────────────────────────────────────────────┐              │
│        │ ⌕  Try "Canon EF 50mm f/1.8" or "85mm portrait"       →  │ 56px, 17px   │
│        └──────────────────────────────────────────────────────────┘  max-w 640   │
│                                                                                  │ 16
│           9,575 lenses · 2,187 cameras · 132 systems · updated daily  ◀ 13px mono│
│                                                                                  │ 40
├──────────────────────────────────────────────────────────────────────────────────┤
│ Browse by system                                                    View all →   │ 22px/600
│  Canon EF      384    Nikon F      412    Sony E       298    Leica M      187   │ 4-col
│  Canon RF      142    Nikon Z      118    Sony A       164    Leica L       94   │ 42px rows
│  Fujifilm X    121    M43          203    Pentax K     176    Contax/Y     88    │ mono counts
│                                                          ◀ no cards, no shadows  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Recently updated                                                    View all →   │
│  [▣] Voigtländer 40mm ƒ/1.2 Nokton   40 mm · ƒ/1.2 · 420 g   edited 2 h ago      │ 64px rows
│  [◎] Minolta MD 50mm ƒ/1.7           50 mm · ƒ/1.7 · 225 g   edited 5 h ago      │ ◎ = schematic
├──────────────────────────────────────────────────────────────────────────────────┤
│ Collections                                                         View all →   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile list row card (375px, 76px tall)

```
┌─────────────────────────────────────────────────────┐
│ ┌────┐  Sigma 85 mm ƒ/1.4 DG DN Art            ⌄   │  ← 15px/600, 1 line, ellipsis
│ │ ▣  │  85 mm · ƒ/1.4 · 630 g · 2020               │  ← 13px MONO, --fg-muted
│ │48px│  [Sony E] [Leica L] +1        $671   ★ 7.8  │  ← neutral chips │ mono right
│ └────┘                                              │
├─────────────────────────────────────────────────────┤  ← 1px --rule, full bleed
│ ┌────┐  Minolta MD 50 mm ƒ/1.7                  ⌄   │
│ │ ◎  │  50 mm · ƒ/1.7 · 225 g · 1981               │
│ │mono│  [Minolta SR]                 $48    ★  —   │
│ └────┘  ↑ generated iris monogram (no photo)        │
└─────────────────────────────────────────────────────┘

  Whole card is the tap target (76px ≥ 44px min).
  ⌄ = 44px hit area, expands an inline 6-fact FactRow drawer
      (elements/groups, MFD, filter, blades, coverage, status)
      so a user can qualify a lens without leaving the list.
  Thumb: photo when present (17%), schematic monogram otherwise (83%).
```

---

## Summary (~300 words)

thelensdb.com is a cleanly built product that looks like a SaaS dashboard, not a reference work. The near-black default canvas, 10px rounded floating cards, a 360px marketing hero with no search field, and a stat-card row are the 2023 shadcn idiom — executed well, but signalling "app" where the goal is "encyclopedia". Three typographic failures do the most damage: no tabular figures or mono anywhere (Geist Mono is loaded and never used, so the spec table's prices and measurements ripple instead of aligning); section headings set at 12px uppercase, *smaller* than body text, so `OPTICAL` carries less weight than a table row; and no prose measure, which is why the collection page renders as an unreadable 110-character wall. The all-achromatic `oklch(L 0 0)` palette is the right instinct but has zero chroma, leaving no way to signal importance — compensated by eleven arbitrary hardcoded badge hues that colour *categories* (mount, type, series) rather than *state*, producing a rainbow under every H1 and across 9,575 table rows. The hero image is upscaled from low-res sources, and `ImageGallery` returns `null` when absent, so the 83% of lenses without photos have no designed state at all.

Proposed direction: **"Field Notes"** — light by default, one accent (Coating Amber `oklch(0.62 0.14 68)`) for identity and state plus a functional link blue for navigation, four semantic colours instead of eleven, names in Geist Sans and every quantity in tabular Geist Mono, a two-column article grid (720px body + 344px sticky infobox/price rail) that puts the infobox first on mobile, and a generated **optical-schematic placeholder** — element/group cross-sections and iris monograms derived from real specs — turning the missing-image problem into the site's visual signature. Thirteen new components (Infobox, Breadcrumb, SectionNav, FactRow, CitationMark, ProvenanceLine, CompareTray, EntityCard, FilterDrawer, AppliedFilterChips, EmptyState, StatusBadge, MountBadge). Ten one-week changes lead with flipping to light mode, deleting the page fade, codemodding the 1,081 zinc classes (which closes the whole contrast backlog), and mono/tabular numerals everywhere.

*(Note: I was blocked from writing `report-design.md`, so the full report is inline above. No repo files were modified and no git commands were run. Files referenced: `/Users/florentsegouin/Work/lens-db/.claude/worktrees/redesign-phase-0/frontend/src/app/globals.css`, `.../src/components/ui/badge.tsx`, `.../src/components/ui/table.tsx`, `.../src/components/SpecsTable.tsx`, `.../src/app/layout.tsx`, `.../src/components/page-transition.tsx`, `.../src/components/ImageGallery.tsx`.)*