# mir.com.my as a Nikon source

Assessment written 2026-09-05, after crawling the Nikkor Resources tree with
`scraper/mir-nikkor-scrape.mjs` and mapping the result onto our rows with
`frontend/scripts/map-mir-to-lenses.mjs`. Numbers in `mir-mapping.md`.

## What the site is

[Nikkor Resources](https://www.mir.com.my/rb/photography/companies/nikon/nikkoresources/)
is Leofoo's Nikon reference on mir.com.my, co-developed with Rick Oleson and
Lars Holst Hansen, with contributions credited to MC Lau, Chuck Hester, Ted
Wengelaar, Hiura Shinsaku and Roland Vink. It is the most complete free
treatment of manual-focus Nikkor optics anywhere: organised by focal-length
class and application (fisheye, ultrawide, wide, standard, tele, super-tele,
Micro, PC, Reflex, Medical, UV, Series E, MF zooms, teleconverters, AF), with
the Nikon bodies covered in the neighbouring `hardwares/classics/` tree.

Mechanically it is ideal to crawl: hand-written HTML from the early 2000s, no
JavaScript, no robots.txt (the URL 404s), no rate limiting seen at 350ms
between requests, ~50KB per page, iso-8859-1. Spec blocks are plain
`Key : Value` runs under a "Specifications :" heading.

## The licensing line, and where it falls

The site states that "certain content and images appeared in this site were
either scanned from official marketing leaflets & brochures published by Nikon
and/or contribution from surfers who claimed originality of their work for
educational purposes", and individual images carry credits like "Image(s)
copyright © 2008. All rights reserved. Please respect the visual property of
the contributing photographer."

So the split is:

- **Facts are fine.** Optical construction, weight, dimensions, filter size,
  closest focus, angle of view, aperture range, introduction year, serial
  ranges. Facts are not copyrightable, and they are exactly what our spec
  columns want. `mir-nikkor-scrape.mjs` takes these.
- **Prose is not.** The body copy is Leofoo's own writing. Copying it would be
  straight infringement, and it would also be off-voice for us.
- **Images are not, and they are not even his to license.** Most carry a
  third-party credit. The scraper records image URLs so a human can ask, per
  page, per contributor. It downloads nothing.

If we want the images (and 585 of our 770 Nikon lens rows have none), the route
is an email to the site owner and to the credited photographers, not a scrape.
That is worth doing: this is a hobbyist reference that has been up for twenty
years, and an attribution-with-link arrangement is the kind of thing such sites
usually say yes to.

## What the crawl actually found

The crawl visits the Nikkor Resources tree plus the Nikon body pages under
`hardwares/classics/`. 450 pages fetched, 149 of them carrying a spec block,
with 778 in-scope URLs still queued when the cap hit: the tree is roughly three
times larger than this pass, so a full sweep is a config change, not new work.
115 of those spec blocks were complete enough to try to match, 30 matched one
of our 770 Nikon lens rows with confidence, and 35 stayed ambiguous because
several versions of the same optic score alike on a family index page.

The headline is not what I expected going in: **mir barely fills any of our
empty columns.** Of the 30 confident matches, exactly one carried a value for
a column we hold empty (a filter size); five disagreed with a value we already
hold; the rest simply agreed. Our Nikon manual-focus rows already carry
construction, weight and dimensions from lens-db.com, and lens-db.com and mir
were evidently drawing on the same Nikon brochures.

Where mir earns its place is the other three things:

1. **Verification and conflict-finding.** The mapping run flags the five rows
   where our number and mir's disagree: the 85-250mm f/4 quoted at 16 elements
   against mir's 20, three super-teles 200-400g apart, and the 600mm f/5.6 ED
   where our 4,800g is the lens with its AU-1 focusing unit and mir's 2,300g is
   the head alone. Some of those are a real error on one side and some are two
   valid configurations, but they are all rows a human should look at, and we
   had no way to generate that list before.

2. **Variant disambiguation, which is the duplicate problem.** This is the
   payoff. mir plus Roland Vink's serial list settle questions our data cannot
   answer alone: that Nikon shipped exactly one non-AI 15mm f/5.6 (the
   Nikkor-QD·C Auto, s/n 321001 onward, June 1973) and that the plain QD Auto
   never left prototype. That is what proved `Nikon Nikkor-QD·C 15mm F/5.6`
   (id 4791) and `Nikon Nikkor-QD[·C] Auto 15mm F/5.6` (id 4792) were one lens,
   and it corrected the survivor's year from lens-db.com's impossible 1970.
   See `stub-duplicates.md` for the 103 more rows shaped like that one.

3. **Years.** lens-db.com's years are unreliable for the pre-AI era (the 15mm
   was dated three years before production, and before its own prototype). mir
   gives a narrative introduction date and Vink gives a production month.

## What I would do next, in order

1. **Work the conflicts.** Small list, high value, no permission needed.
2. **Work `stub-duplicates.md`.** 103 review-queue rows, of which the ones with
   a single candidate are mostly decidable at a glance. This is the largest
   remaining data-quality item in the corpus.
3. **Import Vink's serial table as version evidence.** `serialno.html` is one
   page, machine-readable, and it enumerates every Nikkor variant with serial
   ranges and production months. It is the authority that would let
   `lens_version_groups` (1 row today) actually be populated for Nikon, and it
   would give the pre-AI years a real source. Note its TLS certificate has
   expired, so fetch it over plain HTTP or with verification relaxed.
4. **Ask about the images and the prose.** One email. If the answer is yes,
   we get photographs for several hundred rows that have none, and the answer
   to "what do we put on a page for a lens nobody has photographed."
5. **Then do the same for other makers.** mir covers Canon, Olympus, Pentax,
   Minolta and Rollei in the same `hardwares/classics/` tree, with the same
   page shapes. The crawler's scope list is the only thing that is Nikon-specific.

## Reproducing this

```bash
cd scraper
node mir-nikkor-scrape.mjs --limit 450 --delay 350   # writes mir-nikkor.json

cd ../frontend
node scripts/map-mir-to-lenses.mjs ../scraper/mir-nikkor.json \
  --md ../docs/redesign/research/mir-mapping.md
```

Neither script writes to the database.
