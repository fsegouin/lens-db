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
- **Images carry a credit, not a licence.** Most name a contributor rather than
  the site, and some are brochure scans that are Nikon's rather than either.

**Decision (2026-09-05): the photographs are in use, with credit.** This was
taken as an owner's call with the position above on the table: naming a source
is not the same as being licensed by it, so the exposure here is a takedown
request rather than nothing. What that decision buys is real, because Commons
covers bodies far better than glass: the Commons backfill has the Nikon camera
rows down to 17 without a photograph, while 539 of 769 Nikon lens rows still
have none.

`import-mir-images.mjs` implements it as narrowly as the decision allows:

- The credit is the **named photographer** where a page names one, and the site
  only where it does not. mir credits per page in a line that runs into the
  contributor's email address, so the importer cuts the address out: a credit
  line should not republish someone's inbox.
- Every file is re-hosted on our R2 at 500px webp, so we never spend their
  bandwidth, and the credit links back to the page it came from.
- Nothing is taken that cannot be tied to the product. See the note on
  precision below.

Asking permission is still the better end state, and it is now a smaller ask:
one email that says which pages we used and shows the credit line already in
place. Worth sending.

## What the crawl actually found

The crawl visits the Nikkor Resources tree plus the Nikon body pages under
`hardwares/classics/`. A full sweep is 1,500 pages, 335 of them carrying a spec
block, with only 69 in-scope URLs left unvisited and 170 dead internal links
(their 404s, not ours). Of the spec blocks, 234 are lens pages and 91 body
pages.

Bodies needed a second vocabulary. The first pass used lens spec keys only, and
got a block out of 6 body pages in 232; teaching the parser the camera keys
("Type of camera", "Lens mount", "Shutter-speed settings", "Metering System")
took the FM3A page from 3 keys to 28.

The headline on **specifications** is not what I expected going in: **mir
barely fills any of our empty columns for lenses.** Of 57 confident lens
matches, two carried a value for a column we hold empty; eleven disagreed with
a value we already hold; the rest agreed. Our Nikon manual-focus rows already
carry construction, weight and dimensions from lens-db.com, and both were
evidently drawing on the same Nikon brochures.

**Bodies are the opposite**, because our camera rows are much thinner: 19 of
the 31 body pages matched a row, and 15 of those would fill an empty column
(mostly `shutter_type`, which no Nikon film body has).

**Photographs are where the real gap was.** 45 lens rows and 2 camera rows now
carry 112 images from mir, re-hosted on our R2 with the photographer credited.
That leaves 539 Nikon lens rows still without a picture, so this is a dent, not
a fix, but it is the only source that has moved that number at all.

Where mir earns its place beyond that is three things:

1. **Verification and conflict-finding.** The mapping run flags the rows where
   our number and mir's disagree: the 85-250mm f/4 quoted at 16 elements
   against mir's 20, several super-teles 200-400g apart, and the 600mm f/5.6 ED
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

## Picking the right photograph, which took four passes

A page carries far more than its subject, and the first three dry runs all put
the wrong thing on a lens. Worth writing down, because the same traps apply to
any maker's section of this site:

- **GIFs are never photographs here.** They are depth-of-field scales,
  viewfinder diagrams and animations. Excluded outright.
- **A page shows more than one lens.** mir files every 500mm together, so an
  AF-S 500mm sat on the AI 500mm f/4P, and a rangefinder 180mm on the SLR one.
  A filename claiming a lens family the row is not in now scores negative.
- **A bare focal number matches almost anything.** "85" pulled a photo of a
  25-85mm onto the 85-250mm. The focal length must appear with its unit.
- **For a zoom, the wide end alone is just as loose in the other direction.**
  "28mmduallenscompared.jpg" is two 28mm primes, not the 28-50mm zoom, so a
  zoom must be named as a range.
- **Not every image on a lens page is of a lens.** One offered
  "digitize_future_A.jpg", a banner for an unrelated service.
- **Detail crops make poor lead images.** The data plate, meter prong and DOF
  scale are the right lens but the wrong photograph to lead with, so they sort
  below a full view rather than being dropped.

The resulting rule is: the filename must name the product, and anything naming
a different family is refused. A missing photograph beats a wrong one, which is
the call `backfill-commons-images.mjs` already made for cameras.

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
4. **Apply the body specs.** 15 camera rows have an empty column mir can fill,
   `shutter_type` above all. Nothing writes those yet: `map-mir-to-cameras.mjs`
   reports them and stops, the way the lens mapper does.
5. **Send the email anyway.** The photographs are in use with credit, so this
   is now a courtesy that turns a takedown risk into a permission, and it costs
   one message. Include the page list and a screenshot of the credit line.
6. **Then do the same for other makers.** mir covers Canon, Olympus, Pentax,
   Minolta and Rollei in the same `hardwares/classics/` tree, with the same
   page shapes. The crawler's scope list is the only Nikon-specific part, and
   the image-picking rules above are what would need re-tuning per maker.

## Reproducing this

```bash
cd scraper
node mir-nikkor-scrape.mjs --limit 1500 --delay 300   # writes mir-nikkor.json

cd ../frontend
node scripts/map-mir-to-lenses.mjs  ../scraper/mir-nikkor.json --md ../docs/redesign/research/mir-mapping.md        --json /tmp/lenses.json
node scripts/map-mir-to-cameras.mjs ../scraper/mir-nikkor.json --md ../docs/redesign/research/mir-camera-mapping.md --json /tmp/cameras.json

# Images: dry run first, it prints every pick with its classified background.
node scripts/import-mir-images.mjs ../scraper/mir-nikkor.json /tmp/lenses.json --type lenses
node scripts/import-mir-images.mjs ../scraper/mir-nikkor.json /tmp/lenses.json --type lenses --apply
```

Only `import-mir-images.mjs --apply` writes. It adds to rows that have no
photograph and leaves illustrated rows alone unless given `--all`, so re-running
it is a no-op.
