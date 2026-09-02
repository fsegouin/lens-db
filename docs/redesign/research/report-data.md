# The Lens DB — data audit for the redesign pitch
Generated 2026-09-02T19:03:06.424Z from the production Supabase database (read-only). Raw numbers: `db-audit.json`. Unless noted, lens/camera percentages are over **live** rows (rows with `merged_into_id IS NULL`): 9,575 lenses (of 9,625; 50 merged) and 2,187 cameras (of 2,189; 2 merged).

## Ten most important findings for the redesign

1. **The spec corpus is large and dense; the prose and pictures are not.** 9,575 live lenses, 2,187 cameras, 132 mount systems. 99.9% of lenses carry a structured `specs` blob (261 distinct keys) and the core numeric columns are well filled (focal length 95.4%, max aperture 95.4%, elements 90.5%, min focus 89.4%, weight 83.5%, year 82.6%). That is a real encyclopedic foundation, but only for the *table* half of an article.
2. **Images are the single biggest gap, and it is worst on the pages people open.** Only 16.9% of lenses and 33.5% of cameras have at least one image. Of the 200 most-viewed lenses, **178 (89.0%) have no image**; of the 50 most-viewed cameras, 25 have none. Image coverage is actually *lower* in the top tier (11.5%) than in the long tail (19.2%) because the images come from recent DPReview imports, not from the vintage catalogue people browse.
3. **Descriptions are missing for 38% of lenses and a quarter of the rest are boilerplate.** 38.3% of lenses have no description; only 51.5% have one of 200+ characters. 1,387 lenses (23.5% of described lenses) share one of just 519 identical texts (series-level paragraphs pasted onto every member). 6.7% match press-release phrasing and 21.4% use first/second-person marketing voice ("we", "your").
4. **Cameras are a spec sheet, not an encyclopedia.** 13 of 2,187 cameras (0.6%) have any description at all; 7 have 200+ characters. Body type is filled for 31.5%, sensor type for 37.9% of the 717 digital bodies. On the plus side: year 98.3%, sensor/film format 99.5%, megapixels 92.2% of digital, price estimate 100.0%.
5. **The relationship graph — the thing that makes a wiki a wiki — is essentially unbuilt.** `lens_compatibility` has **0 rows** (no lens is linked to any camera), `tags`/`lens_tags` are empty, `lens_version_groups` holds 1 group with 2 lenses, only 15.0% of lenses are in a collection and 47.7% in a series, 4.2% have more than one mount recorded. Systems have no `mount_type` (0/132) and only 6/132 have a description of 200+ characters.
6. **Pricing is the crown jewel and is fresh.** 98.4% of lenses and 100.0% of cameras have an eBay-derived estimate; 142,966 individual sale records back them (94,532 lens sales across 7,719 lenses, sales dated 2016-12-08 to 2026-07-22). Only 3 estimates are older than 60 days. Caveats: 1,707 lens estimates (18.1%) carry a rarity label but **no price**, and `price_history` has not been refreshed since 2026-07-23 even though estimates were re-stamped in late August.
7. **There is no community yet — there is one bot and two people.** 37 registered users. Of 2,221 revisions, 1,862 (83.8%) were made by the "DPReview Watcher" automation; the 6 humans who ever edited made 254 edits, 97.2% of them by the admin and one trusted user. 1 lens was ever submitted by the public, 9 issue reports exist, 2 edits await review. Ratings (439 total on 4.1% of lenses) are polarised: 41.7% are 1–2 stars and 29.2% are 9–10.
8. **View counts cannot tell you what is popular.** Total lens views are 42,024 with a median of 4 per lens and a maximum of 127; the top 10% of lenses hold only 28.2% of views and no lens has 1,000+ views (2 have 100+). Views decline steadily with row id (6.1 avg for id<2000 vs 3.1 for id≥9000) and the #1 "most viewed" lens is "[Auto] Tamron-F 28mm F/2.8" — a name that sorts first alphabetically. This is the signature of crawlers walking the catalogue, not of reader demand. Comparison usage is negligible (54 lens pairs, 136 views). Prioritisation should use real analytics (PostHog/search logs), not `view_count`.
9. **Controlled vocabularies have drifted and the specs blob is full of placeholders.** `coverage` has 17 distinct spellings for ~5 concepts ("full-frame", "Full frame", "35mm FF", "full frame"...), `era` contains "Announced in 1940"-style strings and "Pro", `production_status` contains "Film era"/"Digital era" and mount-suffixed variants, `lens_type` mixes generic "Prime lens" (1966) with fine-grained classes and lowercase "teleconverter"/"accessory". In `specs`, 23,564 values are empty strings (3,664 lenses) and many more are literal "<No information>", "<No data>", "Not available for your region", "-". Any faceted filter built on these fields will be wrong until they are normalised.
10. **Provenance and identity need a decision.** 98.2% of lens source URLs and 100% of camera source URLs point at lens-db.com; the corpus is a derivative of one site, including its editorial voice. There are also 103 strict duplicate-name groups (207 lenses; 139/297 when bracketed variants are folded), duplicated cameras (three "Leica M3 Gold", three "Exakta 66"), duplicated collections ("Macro 1:1" twice, "Fisheye lenses" twice, "Nifty forties"/"Nifty fourties"), 65 cameras and 64 lenses with no system, and 2181/2,189 camera slugs carrying a literal `camera/` prefix (served as `/cameras/camera/<slug>` through a catch-all route). A "Wikipedia of lenses" needs one canonical page per product, with clear sourcing and attribution.

## A. Row counts

| Table | Rows |
| --- | --- |
| price_history | 142,966 |
| price_estimates | 11,615 |
| lens_systems | 10,511 |
| lenses | 9,625 |
| lens_series_memberships | 4,977 |
| revisions | 2,221 |
| cameras | 2,189 |
| lens_collections | 1,999 |
| dpreview_lens_candidates | 1,419 |
| pending_edits | 574 |
| lens_ratings | 439 |
| systems | 132 |
| lens_series | 124 |
| system_redirects | 111 |
| lens_comparisons | 54 |
| camera_ratings | 53 |
| collections | 50 |
| users | 37 |
| duplicate_flags | 29 |
| camera_comparisons | 14 |
| issue_reports | 9 |
| lens_version_groups | 1 |
| blocked_ips | 0 |
| email_verification_tokens | 0 |
| lens_compatibility | 0 |
| lens_tags | 0 |
| tags | 0 |

Notable empties: `lens_compatibility`, `tags`, `lens_tags`, `blocked_ips`, `email_verification_tokens` are 0; `lens_version_groups` = 1. Lens rows were created in two bursts: 9,470 in 2026-03 (bulk import) and 154 in 2026-09 (DPReview watcher imports).

## B. Lens completeness (9,575 live lenses)

| Field | Filled | % |
| --- | --- | --- |
| description (non-empty) | 5,906 | 61.7% |
| description ≥ 200 chars | 4,930 | 51.5% |
| images (≥1) | 1,618 | 16.9% |
| images (≥2) | 1,013 | 10.6% |
| year_introduced | 7,906 | 82.6% |
| year_discontinued | 7 | 0.1% |
| weight_g | 7,998 | 83.5% |
| filter_size_mm | 6,058 | 63.3% |
| min_focus_distance_m | 8,563 | 89.4% |
| max_magnification | 3,895 | 40.7% |
| lens_elements | 8,661 | 90.5% |
| lens_groups | 8,578 | 89.6% |
| diaphragm_blades | 7,095 | 74.1% |
| length / diameter (no column; see specs "Maximum diameter x Length") | 7,916 | 82.7% |
| system_id (primary mount) | 9,511 | 99.3% |
| lens_systems rows (any mount) | 9,511 | 99.3% |
| multi-mount (>1 lens_systems row) | 400 | 4.2% |
| brand | 9,575 | 100.0% |
| lens_type | 9,499 | 99.2% |
| era | 6,860 | 71.6% |
| production_status | 7,985 | 83.4% |
| coverage | 1,600 | 16.7% |
| focal_length_min | 9,136 | 95.4% |
| focal_length_max | 9,136 | 95.4% |
| aperture_min (max aperture) | 9,138 | 95.4% |
| aperture_max (min aperture) | 8,971 | 93.7% |
| url (source) | 9,017 | 94.2% |
| specs non-empty | 9,563 | 99.9% |
| has_autofocus = true | 2,420 | 25.3% |
| has_stabilization = true | 434 | 4.5% |
| is_zoom | 2,032 | 21.2% |
| is_prime | 7,103 | 74.2% |
| is_macro | 931 | 9.7% |
| price estimate row | 9,420 | 98.4% |
| price history rows | 7,714 | 80.6% |
| rating_count > 0 | 388 | 4.1% |
| view_count > 0 | 9,079 | 94.8% |
| series membership | 4,569 | 47.7% |
| collection membership | 1,432 | 15.0% |
| tags | 0 | 0.0% |
| compatibility rows | 0 | 0.0% |
| version_group_id | 2 | 0.0% |
| version_label | 2 | 0.0% |
| has ≥1 revision | 1,575 | 16.4% |

### Top 40 `specs` keys (present / non-empty value)

| Key | Present | % lenses | Non-empty |
| --- | --- | --- | --- |
| Weight | 8,971 | 93.7% | 8,589 |
| Maximum format | 8,674 | 90.6% | 8,674 |
| Lens construction | 8,664 | 90.5% | 8,282 |
| Focusing modes | 8,469 | 88.4% | 8,469 |
| Closest focusing distance | 8,462 | 88.4% | 8,080 |
| Diagonal angle of view | 8,382 | 87.5% | 8,382 |
| Lens hood | 8,348 | 87.2% | 7,966 |
| Filters | 8,346 | 87.2% | 7,964 |
| Maximum diameter x Length | 8,298 | 86.7% | 7,916 |
| Diaphragm type | 8,258 | 86.2% | 8,258 |
| Number of blades | 8,063 | 84.2% | 7,679 |
| Manual focus control | 7,944 | 83.0% | 7,944 |
| Aperture control | 7,580 | 79.2% | 7,580 |
| Mount and Flange focal distance | 6,980 | 72.9% | 6,980 |
| Focal length | 6,647 | 69.4% | 6,647 |
| Magnification ratio | 6,338 | 66.2% | 6,338 |
| Speed | 6,116 | 63.9% | 6,116 |
| Teleconverters | 5,820 | 60.8% | 5,820 |
| Announced | 5,413 | 56.5% | 5,015 |
| Production status | 4,975 | 52.0% | 4,975 |
| Original name | 4,725 | 49.3% | 4,725 |
| Physical characteristics | 3,606 | 37.7% | (outside top-40 non-empty) |
| System | 3,547 | 37.0% | 3,547 |
| Accessories | 3,337 | 34.9% | (outside top-40 non-empty) |
| Optical design | 3,250 | 33.9% | (outside top-40 non-empty) |
| Diaphragm mechanism | 3,192 | 33.3% | (outside top-40 non-empty) |
| Focusing | 3,192 | 33.3% | (outside top-40 non-empty) |
| Weather sealing | 3,162 | 33.0% | 3,162 |
| Fluorine coating | 2,598 | 27.1% | 2,598 |
| 35mm equivalent speed | 2,221 | 23.2% | 2,221 |
| 35mm equivalent focal length | 2,221 | 23.2% | 2,221 |
| Country of design | 2,013 | 21.0% | 2,013 |
| Class | 2,001 | 20.9% | 2,001 |
| Focus mode selector | 1,992 | 20.8% | 1,989 |
| Mount | 1,986 | 20.7% | 1,986 |
| Zooming method | 1,947 | 20.3% | 1,947 |
| Zoom type | 1,888 | 19.7% | 1,888 |
| Autofocus motor | 1,823 | 19.0% | 1,823 |
| Focal length range | 1,728 | 18.0% | 1,728 |
| Speed range | 1,728 | 18.0% | 1,728 |

261 distinct keys in total. 23,564 values are empty strings across 3,664 lenses; placeholder strings ("<No information>", "<No data>", "Not available for your region", "-") are common and are not counted as empty above.

### Column-fill headroom from `specs` (column NULL but a spec value exists)

| Spec key | Lenses fillable | Sample values where column is NULL |
| --- | --- | --- |
| Weight | 602 | <No information> \| Not available for your region \| <No data> \| No information |
| Announced | 913 | <No information> \| Not available for your region \| No information \| <No data> |
| Filters | 2,491 | Removable front filters are not accepted; Built-in UV, Y2, O2, R2 (part of the lens optical system) \| Series VIII \| Screw-type 115mm \| <No information> \| Removable front filters are not accepted; Built-in UVa, Or, Y, Bl (part of the lens optical system) |
| Number of blades | 1,136 | <No information> \| - \| Not available for your region \| <No data> \| 5 (five) |
| Magnification ratio | 3,436 | 1.4:1 \| 0.5x \| 1.23:1 \| 1.2:1 \| 0.2x |
| Maximum diameter x Length | 7,962 | ⌀156.5×521mm(Sigma SA) \| ⌀60.5×15.6mm (Pentax K) \| ⌀64×130mm(mount not specified) \| ⌀?×153mm \| ⌀83×89.5mm |
| Mount and Flange focal distance | 7,017 | Contarex[46mm](Bellows) \| Kilfitt Kilarflex \| M40 [44mm] \| Canon FD[42mm]; M42[45.5mm]; Minolta SR[43.5mm]; Nikon F[46.5mm] \| Topcon[44.7mm] |
| Focusing modes | 8,518 | Autofocus (AF), Manual focus (M) \| Autofocus (A), Manual focus (M) \| Autofocus only \| Manual focus only (by rack-and-pinion mechanism) \| Both autofocus and manual focus |

"Magnification ratio" (values such as "1.4:1", "0.5x") is cleanly parseable for 3,436 lenses. "Weight", "Announced" and "Number of blades" gaps are mostly placeholders, so the column is not much worse than the source. "Maximum diameter x Length" (⌀ × length, per mount) exists for 7,962 lenses but has no column at all.

### Images

- 16.9% of lenses have ≥1 image (1,618); 10.6% have ≥2. 4,105 lens images in total, all on the site's own R2 bucket (`pub-452f806914084c1384d3fafe70f6be32.r2.dev`), stored as `{alt, src}` objects.
- Cameras: 2,412 images across 732 cameras on R2; 9 hot-linked from 1.img-dpreview.com.
- By tier of view_count: top 200 = 11.5%, 201–1000 = 12.6%, 1001–5000 = 15.4%, rest = 19.2%.

### Description length

| Bucket (chars) | Lenses | % |
| --- | --- | --- |
| 0 | 3,669 | 38.3% |
| <200 | 976 | 10.2% |
| 200-800 | 2,849 | 29.8% |
| >800 | 2,081 | 21.7% |

Among the 5,906 lenses with a description: average 1,025 chars, median 536. Press-release heuristic ("press release" / "announces" / "today" / "is proud"): **397 (6.7%)** — "today" 314, "announces" 85, "is proud" 28, "press release" 0. First/second-person voice ("we/our/you/your"): 1,262 (21.4%).

**Shared boilerplate:** 1,387 lenses share 519 identical description texts. The most reused:

| Lenses | Text (head) |
| --- | --- |
| 26 | The autofocus will not be available with Nikon D40, D40X, D60, D3000-D3500, D5000-D5600 digital SLR cameras. |
| 24 | Independent-brand lenses were made for 35mm film SLR cameras by companies that competed with the camera manufacturers. Some came from factories that made lenses |
| 24 | The third generation of lenses designed for Pentax 35mm SLR cameras with bayonet mount. Introduced with the Pentax super A in 1983.Robust, all-metal design with |
| 20 | The first generation of lenses designed for Asahi Pentax 35mm SLR cameras with bayonet mount. Introduced with Asahi Pentax K2, KX and KM in 1975.Robust, all-met |
| 18 | The second generation of autofocus lenses designed for Pentax 35mm SLR cameras. Introduced with the Pentax Z-10 in 1991.Lens barrels made from engineering plast |
| 17 | The second generation of Tamron lenses with interchangeable mount system for practically all major SLR cameras. Introduced in 1973.All-black finish;Compact, lig |
| 16 | Catadioptric system consisting of curved mirrors and optical glass;Much shorter, lighter and less expensive designs than conventional super telephoto lenses;Out |
| 15 | The first generation of autofocus lenses designed for Pentax 35mm SLR cameras. Introduced with the Pentax SFX in 1987.Lens barrels made from engineering plastic |

### Description / image / year fill by brand (top 15 brands)

| Brand | Lenses | % desc ≥200 | % image | % year |
| --- | --- | --- | --- | --- |
| Nikon | 775 | 67.5% | 23.9% | 94.6% |
| Leica | 655 | 68.7% | 10.4% | 98.9% |
| Carl Zeiss | 622 | 67.0% | 9.6% | 89.5% |
| Canon | 582 | 74.6% | 34.2% | 97.1% |
| Sigma | 577 | 70.5% | 25.8% | 97.6% |
| Pentax | 556 | 73.6% | 15.6% | 96.4% |
| Minolta | 471 | 33.1% | 1.5% | 97.5% |
| Tamron | 361 | 67.0% | 20.8% | 95.8% |
| Cosina | 321 | 54.8% | 0.0% | 86.6% |
| Mamiya | 313 | 41.5% | 1.6% | 64.5% |
| Tokina | 257 | 55.6% | 13.2% | 75.5% |
| Fuji | 240 | 46.7% | 30.8% | 67.5% |
| Olympus | 207 | 44.0% | 32.9% | 90.8% |
| Vivitar | 188 | 62.2% | 1.1% | 69.1% |
| Yashica | 185 | 27.0% | 3.2% | 48.6% |

Minolta (33.1% described, 1.5% imaged), Cosina/Voigtländer (0% imaged), Mamiya, Yashica and Vivitar are the weakest large brands.

## C. Camera completeness (2,187 live cameras)

| Field | Filled | % |
| --- | --- | --- |
| description (non-empty) | 13 | 0.6% |
| description ≥ 200 chars | 7 | 0.3% |
| images (≥1) | 733 | 33.5% |
| year_introduced | 2,150 | 98.3% |
| sensor_size (sensor / film format) | 2,176 | 99.5% |
| sensor_type | 272 | 12.4% |
| megapixels | 661 | 30.2% |
| resolution | 662 | 30.3% |
| body_type | 689 | 31.5% |
| weight_g | 1,677 | 76.7% |
| system_id (mount) | 2,122 | 97.0% |
| alias | 7 | 0.3% |
| url (source) | 1,974 | 90.3% |
| specs non-empty | 2,186 | 100.0% |
| price estimate row | 2,187 | 100.0% |
| rating_count > 0 | 45 | 2.1% |
| view_count > 0 | 2,163 | 98.9% |
| compatibility rows | 0 | 0.0% |
| has ≥1 revision | 55 | 2.5% |

### Digital vs film split (derived from specs "Imaging sensor" / "Film type")

| Kind | Cameras | megapixels | sensor_type | image | weight | body_type | year |
| --- | --- | --- | --- | --- | --- | --- | --- |
| film | 1,418 | 0.0% | 0.0% | 18.3% | 69.1% | 29.6% | 97.5% |
| digital | 717 | 92.2% | 37.9% | 66.0% | 91.5% | 37.5% | 100.0% |
| unknown | 52 | 0.0% | 0.0% | 1.9% | 78.8% | 0.0% | 98.1% |

Megapixels are effectively complete for digital bodies; the "missing megapixels" in the raw column is film cameras. Sensor type, however, is known for only 37.9% of digital bodies. Film-type is a `specs` key ("Film type", 1419 cameras) and has no column.

### Description length

| Bucket (chars) | Cameras | % |
| --- | --- | --- |
| 0 | 2,174 | 99.4% |
| <200 | 6 | 0.3% |
| 200-800 | 6 | 0.3% |
| >800 | 1 | 0.0% |

### Top 30 `specs` keys

| Key | Cameras | % |
| --- | --- | --- |
| Dimensions | 2,180 | 99.7% |
| Maximum format | 2,176 | 99.5% |
| Weight | 2,176 | 99.5% |
| Type | 2,137 | 97.7% |
| Model | 2,039 | 93.2% |
| Speeds | 2,014 | 92.1% |
| Exposure modes | 1,968 | 90.0% |
| Exposure metering | 1,968 | 90.0% |
| Mount and Flange focal distance | 1,891 | 86.5% |
| Film type | 1,419 | 64.9% |
| Format | 1,169 | 53.5% |
| Shutter | 1,001 | 45.8% |
| Exposure | 1,001 | 45.8% |
| Physical characteristics | 1,001 | 45.8% |
| Announced | 989 | 45.2% |
| System | 850 | 38.9% |
| Imaging sensor | 664 | 30.4% |
| Country of design | 528 | 24.1% |
| Sensor-shift image stabilization | 505 | 23.1% |
| Resolution | 505 | 23.1% |
| Rangefinder | 469 | 21.4% |
| Viewfinder | 469 | 21.4% |
| Parallax compensation | 456 | 20.9% |
| Bright-line frames | 441 | 20.2% |
| Crop factor | 428 | 19.6% |
| Finder magnification | 360 | 16.5% |
| Effective rangefinder base | 339 | 15.5% |
| Actual rangefinder base | 339 | 15.5% |
| Production type | 337 | 15.4% |
| Availability | 284 | 13.0% |

### Sensor sizes / body types / sensor types (top values)

| sensor_size | n |
| --- | --- |
| 35mm full frame | 1,454 |
| APS-C | 328 |
| Medium format 6x6 | 117 |
| Four Thirds | 94 |
| Medium format 6x4.5 | 50 |
| Full frame | 29 |
| Medium format 44x33 | 22 |
| Medium format 6x7 | 21 |
| APS-H | 15 |
| 1″ | 14 |
| (null) | 11 |
| Medium format 45x30 | 8 |
| Half frame | 6 |
| Medium format 6.5x4 | 5 |
| Medium format 49x37 | 4 |

| body_type | n |
| --- | --- |
| (null) | 1,498 |
| Focal-plane | 456 |
| Rangefinder-style mirrorless | 76 |
| SLR-style mirrorless | 73 |
| Compact SLR | 27 |
| Mid-size SLR | 21 |
| In-lens leaf shutter | 19 |
| Large SLR | 14 |
| Compact | 2 |
| Leaf shutter | 1 |

| sensor_type | n |
| --- | --- |
| (null) | 1,915 |
| CMOS | 214 |
| BSI-CMOS | 25 |
| CCD | 22 |
| Stacked CMOS | 9 |
| CMOS (Foveon X3) | 2 |

Note the vocabulary mix in `sensor_size` ("35mm full frame" 1454 vs "Full frame" 29) and in `body_type`, which mixes shutter types ("Focal-plane", "In-lens leaf shutter") with body styles ("SLR-style mirrorless").

## D. Distributions

### Lenses by brand (top 25 of 278 brands)

| Brand | Lenses | % |
| --- | --- | --- |
| Nikon | 775 | 8.1% |
| Leica | 655 | 6.8% |
| Carl Zeiss | 622 | 6.5% |
| Canon | 582 | 6.1% |
| Sigma | 577 | 6.0% |
| Pentax | 556 | 5.8% |
| Minolta | 471 | 4.9% |
| Tamron | 361 | 3.8% |
| Cosina | 321 | 3.4% |
| Mamiya | 313 | 3.3% |
| Tokina | 257 | 2.7% |
| Fuji | 240 | 2.5% |
| Olympus | 207 | 2.2% |
| Vivitar | 189 | 2.0% |
| Yashica | 185 | 1.9% |
| Sony | 178 | 1.9% |
| Samyang | 168 | 1.8% |
| Schneider-Kreuznach | 167 | 1.7% |
| Ricoh | 136 | 1.4% |
| Konica | 125 | 1.3% |
| Soligor | 102 | 1.1% |
| Bronica | 100 | 1.0% |
| Meyer-Optik Görlitz | 82 | 0.9% |
| Panasonic | 77 | 0.8% |
| Komura | 70 | 0.7% |

### Lenses by primary mount system (top 25)

| System | Slug | Lenses | % |
| --- | --- | --- | --- |
| Canon EF | canon-ef | 973 | 10.2% |
| Canon FD | canon-fd | 712 | 7.4% |
| M42 | m42 | 662 | 6.9% |
| Leica M | leica-m | 658 | 6.9% |
| Nikon F | nikon-f | 642 | 6.7% |
| Leica Screw Mount (M39 / LTM) | leica-screw-mount-m39-ltm | 531 | 5.5% |
| Pentax K | pentax-k | 479 | 5.0% |
| Minolta SR | minolta-sr | 326 | 3.4% |
| Sony E | sony-e | 295 | 3.1% |
| Exakta | exakta | 221 | 2.3% |
| Fujifilm X | fujifilm-x | 209 | 2.2% |
| Minolta/Sony A | minoltasony-a | 209 | 2.2% |
| Canon RF | canon-rf | 193 | 2.0% |
| Leica R | leica-r | 175 | 1.8% |
| T-mount (T2) | t-mount-t2 | 171 | 1.8% |
| Contax/Yashica | contaxyashica | 160 | 1.7% |
| Leica L | leica-l | 158 | 1.7% |
| Canon EF-M | canon-ef-m | 152 | 1.6% |
| Nikon Z | nikon-z | 136 | 1.4% |
| Micro Four Thirds | micro-four-thirds | 117 | 1.2% |
| Interchangeable mount | interchangeable-mount | 101 | 1.1% |
| Olympus OM | olympus-om | 101 | 1.1% |
| Hasselblad V | hasselblad-v | 97 | 1.0% |
| Tamron Adaptall-2 | tamron-adaptall-2 | 94 | 1.0% |
| Mamiya M645 | mamiya-m645 | 91 | 1.0% |

### Lenses by decade of introduction

| Decade | Lenses | % |
| --- | --- | --- |
| 1930s | 64 | 0.7% |
| 1940s | 115 | 1.2% |
| 1950s | 592 | 6.2% |
| 1960s | 713 | 7.4% |
| 1970s | 1,325 | 13.8% |
| 1980s | 1,171 | 12.2% |
| 1990s | 817 | 8.5% |
| 2000s | 858 | 9.0% |
| 2010s | 1,251 | 13.1% |
| 2020s | 1,000 | 10.4% |
| unknown | 1,669 | 17.4% |

### Lenses by type (top 20 `lens_type` values)

| lens_type | Lenses | % |
| --- | --- | --- |
| Prime lens | 1,966 | 20.5% |
| Wide-angle prime lens | 1,142 | 11.9% |
| Standard prime lens | 950 | 9.9% |
| Telephoto zoom lens | 856 | 8.9% |
| Medium telephoto prime lens | 696 | 7.3% |
| Standard zoom lens | 678 | 7.1% |
| Super telephoto prime lens | 605 | 6.3% |
| Short telephoto prime lens | 553 | 5.8% |
| Macro lens | 521 | 5.4% |
| Ultra-wide angle prime lens | 321 | 3.4% |
| Fisheye lens | 220 | 2.3% |
| Zoom lens | 189 | 2.0% |
| teleconverter | 185 | 1.9% |
| Wide-angle zoom lens | 156 | 1.6% |
| accessory | 138 | 1.4% |
| Superzoom lens | 127 | 1.3% |
| Shift lens | 82 | 0.9% |
| (null) | 76 | 0.8% |
| Body cap lenses | 49 | 0.5% |
| Telephoto prime lens | 42 | 0.4% |

### Prime vs zoom, AF vs MF, era, production status, coverage

| Kind | Lenses | % |
| --- | --- | --- |
| prime | 7,103 | 74.2% |
| zoom | 2,032 | 21.2% |
| unknown | 439 | 4.6% |
| prime (inferred) | 1 | 0.0% |

The 439 "unknown" are mostly teleconverters (185), accessories (138) and the 76 lenses with no type.

| Focus | Lenses | % |
| --- | --- | --- |
| AF | 2,420 | 25.3% |
| MF/unknown (flag false) | 7,155 | 74.7% |

`has_autofocus` is a boolean defaulting to false, so MF and "unknown" are indistinguishable. The specs key "Focusing modes" is present on 8,469 lenses and could disambiguate.

| era | Lenses |
| --- | --- |
| Film era | 5,380 |
| (null) | 2,715 |
| Digital era | 1,414 |
| Pro | 56 |
| Digital | 2 |
| Announced in 1940 | 1 |
| Announced in March 1973 | 1 |
| Announced in 1999 | 1 |
| Announced in 1948 | 1 |
| Announced in November 2020 | 1 |
| Announced in September 2020 | 1 |
| Announced in February 2016 | 1 |
| vintage | 1 |

| production_status | Lenses |
| --- | --- |
| Discontinued | 6,850 |
| (null) | 1,590 |
| In production | 1,049 |
| Film era | 46 |
| Digital era | 17 |
| Collectible | 8 |
| Discontinued (Canon EF-M) | 4 |
| Not yet in production | 4 |
| Discontinued (Canon EF-M, Canon RF) | 2 |
| Discontinued (Canon RF) | 1 |
| discontinued | 1 |
| In production (Nikon Z) | 1 |
| Discontinued (Canon EF) | 1 |
| In production (Fujifilm X, Leica L, Nikon Z, Sony E) | 1 |

| coverage | Lenses |
| --- | --- |
| (null) | 7,975 |
| full-frame | 823 |
| aps-c | 603 |
| micro-four-thirds | 119 |
| 35mm FF | 12 |
| Four Thirds | 10 |
| Medium Format | 6 |
| full frame | 6 |
| four-thirds | 6 |
| APS-C | 4 |
| Full frame | 3 |
| 1-inch | 2 |
| Medium format | 1 |
| FourThirds | 1 |
| medium format | 1 |
| Medium format 44x33 | 1 |
| 1 | 1 |
| Micro Four Thirds, Sony E | 1 |

### Cameras by brand (system manufacturer, top 20), by system (top 20), by decade

| Brand | Cameras | % |
| --- | --- | --- |
| Leica | 467 | 21.4% |
| Pentax | 212 | 9.7% |
| Canon | 199 | 9.1% |
| Nikon | 184 | 8.4% |
| Minolta | 111 | 5.1% |
| Olympus / Panasonic | 95 | 4.3% |
| Hasselblad | 78 | 3.6% |
| Sony | 68 | 3.1% |
| Fujifilm | 63 | 2.9% |
| Mamiya | 60 | 2.7% |
| Praktica | 44 | 2.0% |
| Konica | 38 | 1.7% |
| Contax/Yashica | 35 | 1.6% |
| L-Mount Alliance | 32 | 1.5% |
| Rollei | 32 | 1.5% |
| Ihagee | 28 | 1.3% |
| Contax | 28 | 1.3% |
| Alpa | 26 | 1.2% |
| Bronica | 24 | 1.1% |
| Olympus | 24 | 1.1% |

| System | Cameras | % |
| --- | --- | --- |
| Leica M | 243 | 11.1% |
| M42 | 215 | 9.8% |
| Pentax K | 192 | 8.8% |
| Leica Screw Mount (M39 / LTM) | 183 | 8.4% |
| Nikon F | 139 | 6.4% |
| Canon EF | 126 | 5.8% |
| Micro Four Thirds | 95 | 4.3% |
| Minolta/Sony A | 72 | 3.3% |
| Sony E | 68 | 3.1% |
| Hasselblad V | 45 | 2.1% |
| Fujifilm X | 40 | 1.8% |
| Minolta SR | 39 | 1.8% |
| Contax/Yashica | 35 | 1.6% |
| Leica L | 32 | 1.5% |
| Leica R | 30 | 1.4% |
| Alpa | 25 | 1.1% |
| Canon FD | 25 | 1.1% |
| Exakta | 19 | 0.9% |
| Miranda | 19 | 0.9% |
| Olympus OM | 18 | 0.8% |

| Decade | Cameras | % |
| --- | --- | --- |
| 1910s | 1 | 0.0% |
| 1920s | 8 | 0.4% |
| 1930s | 34 | 1.6% |
| 1940s | 50 | 2.3% |
| 1950s | 224 | 10.2% |
| 1960s | 211 | 9.6% |
| 1970s | 277 | 12.7% |
| 1980s | 237 | 10.8% |
| 1990s | 239 | 10.9% |
| 2000s | 287 | 13.1% |
| 2010s | 430 | 19.7% |
| 2020s | 152 | 7.0% |
| unknown | 37 | 1.7% |

Camera "type" as a column is `body_type` (31.5% filled, see section C); the practical type split is film 1,418 / digital 717 / unknown 52.

## E. Engagement signals

> **Caveat:** `view_count` is flat and id-correlated (see finding 8) and the site has had sustained crawler traffic. Treat these rankings as "what bots and a few humans opened", not as demand.

### View concentration (lenses)

| Metric | Value |
| --- | --- |
| Total lens views | 42,024 |
| Median views per lens | 4 |
| Lenses with 0 views | 496 (5.2%) |
| Lenses with 1–9 views | 8,395 (87.7%) |
| 10–99 views | 682 |
| 100–999 views | 2 |
| 1000+ views | 0 |
| Share of views held by top 1% of lenses | 5.6% |
| Share held by top 10% | 28.2% |
| Share held by top 200 | 9.3% |
| Camera views total / top 10% share / zero-view cameras | 10,677 / 21.5% / 24 |

| Lens id range | Lenses | Views | Avg views |
| --- | --- | --- | --- |
| <2000 | 1,558 | 9,529 | 6.1 |
| 2000-3999 | 1,592 | 7,581 | 4.8 |
| 4000-5999 | 1,642 | 8,129 | 5.0 |
| 6000-8999 | 2,093 | 8,319 | 4.0 |
| 9000+ | 2,690 | 8,466 | 3.1 |

### Top 30 lenses by view_count

| # | Lens | Slug | Views | Ratings | Avg |
| --- | --- | --- | --- | --- | --- |
| 1 | [Auto] Tamron-F 28mm F/2.8 | auto-tamron-f-28mm-f28 | 127 | 0 |  |
| 2 | Carl Zeiss N-Mirotar 210mm F/0.03 | carl-zeiss-n-mirotar-210mm-f003-1977 | 115 | 1 | 10 |
| 3 | Nikon AF Nikkor 35mm F/2D | nikon-af-nikkor-35mm-f2d-1995 | 78 | 8 | 6.625 |
| 4 | 7Artisans 4mm F/2.8 Fisheye | 7artisans-4mm-f28-fisheye-2022 | 77 | 1 | 6 |
| 5 | Minolta Auto Rokkor-PF 58mm F/1.4 | minolta-auto-rokkor-pf-58mm-f14-1961 | 60 | 2 | 5.5 |
| 6 | Helios-44-2 58mm F/2 | helios-44-2-58mm-f2 | 56 | 4 | 5.5 |
| 7 | Leica (Leitz Wetzlar, Leitz Canada) Elmarit-R 135mm F/2.8 | leica-elmarit-r-135mm-f28-1968 | 54 | 0 |  |
| 8 | Mamiya-SEKOR 58mm F/1.7 | mamiya-sekor-58mm-f17-1964 | 44 | 0 |  |
| 9 | Vivitar 80-200mm F/4.5 MC Macro | vivitar-80-200mm-f45-mc-macro-sn-77xxxxxx-1982 | 40 | 0 |  |
| 10 | smc Pentax-A 28mm F/2 | smc-pentax-a-28mm-f2-1983 | 29 | 0 |  |
| 11 | APO Mamiya A 200mm F/2.8 | apo-mamiya-a-200mm-f28-1996 | 27 | 0 |  |
| 12 | 7Artisans 6mm F/2 Fisheye | 7artisans-6mm-f2-fisheye-2025 | 27 | 0 |  |
| 13 | Mamiya-Sekor Shift C 50mm F/4 | mamiya-sekor-shift-c-50mm-f4 | 27 | 1 | 1 |
| 14 | Canon Serenar 50mm F/3.5 II | canon-serenar-50mm-f35-ii-1952 | 27 | 0 |  |
| 15 | Helios-81N 50mm F/2 MC | helios-81n-50mm-f2-mc | 26 | 1 | 1 |
| 16 | Mamiya Macro A 120mm F/4 M | mamiya-macro-a-120mm-f4-m | 26 | 1 | 2 |
| 17 | Minolta RF Rokkor 1600mm F/11 | minolta-rf-rokkor-1600mm-f11-1974 | 25 | 3 | 4 |
| 18 | Asahi Super-Takumar 35mm F/2 | asahi-super-takumar-35mm-f2-1963 | 25 | 1 | 4 |
| 19 | Tamron SP 500mm F/8 Mirror 55B | tamron-sp-500mm-f8-mirror-55b-1979 | 25 | 1 | 2 |
| 20 | Canon FD 300mm F/4L | canon-fd-300mm-f4l-1978 | 24 | 1 | 7 |
| 21 | Mamiya-Sekor C 80mm F/1.9 N | mamiya-sekor-c-80mm-f19-n | 23 | 0 |  |
| 22 | Zoomar Muenchen Super Zoomatar 240mm F/1.2 | zoomar-muenchen-super-zoomatar-240mm-f12-1970 | 23 | 0 |  |
| 23 | Carl Zeiss Jena DDR Sonnar 135mm F/3.5 [electric] MC | carl-zeiss-jena-ddr-sonnar-135mm-f35-electric-mc-1976 | 23 | 0 |  |
| 24 | Yashica DSB 38-90mm F/3.5 | yashica-dsb-38-90mm-f35 | 23 | 1 | 8 |
| 25 | Cosina Auto Cosinon 50mm F/1.8 | cosina-auto-cosinon-50mm-f18-1970 | 22 | 0 |  |
| 26 | [Auto] Tamron-F 200mm F/3.5 | auto-tamron-f-200mm-f35 | 22 | 0 |  |
| 27 | Fuji Photo Film X-Fujinar-T 135mm F/2.8 DM | fuji-photo-film-x-fujinar-t-135mm-f28-dm-1981 | 22 | 0 |  |
| 28 | Carl Zeiss Jena DDR Biometar 80mm F/2.8 [MC] | carl-zeiss-jena-ddr-biometar-80mm-f28-mc-1959 | 22 | 0 |  |
| 29 | Leica (Leitz Wetzlar) Macro-Elmarit-R 60mm F/2.8 | leica-macro-elmarit-r-60mm-f28-1970 | 22 | 0 |  |
| 30 | Auto Chinon 28mm F/2.8 MC | auto-chinon-28mm-f28-mc | 22 | 0 |  |

### Top 20 cameras by view_count

| # | Camera | Slug | Views | Ratings | Avg |
| --- | --- | --- | --- | --- | --- |
| 1 | Nikon F6 | camera/nikon-f6-2004 | 28 | 0 |  |
| 2 | AFIOM Kristall 2a | camera/afiom-kristall-2a-1949 | 27 | 4 | 4.25 |
| 3 | Canon EOS R6 Mark III | camera/canon-eos-r6-mark-iii-2025 | 24 | 0 |  |
| 4 | Nikon D850 | camera/nikon-d850-2017 | 22 | 0 |  |
| 5 | Exakta Varex VX | camera/exakta-varex-vx-1951 | 20 | 0 |  |
| 6 | Agfa Ambi Silette (Type 2) | camera/agfa-ambi-silette-1959 | 19 | 0 |  |
| 7 | Nikon F4 | camera/nikon-f4-1988 | 18 | 3 | 8.67 |
| 8 | Nikon F3 | camera/nikon-f3-1980 | 17 | 2 | 8.50 |
| 9 | Canon EOS R6 Mark II | camera/canon-eos-r6-mark-ii-2022 | 16 | 0 |  |
| 10 | Hasselblad H4D-40 Ferrari Limited Edition | camera/hasselblad-h4d-40-ferrari-limited-edition-2010 | 16 | 0 |  |
| 11 | Pentax P30 | camera/pentax-p30-1985 | 16 | 0 |  |
| 12 | AFIOM Kristall 3s II | camera/afiom-kristall-3s-ii-1954 | 16 | 0 |  |
| 13 | Canon EOS R100 | camera/canon-eos-r100-2023 | 15 | 0 |  |
| 14 | Agfa Ambi Silette (Type 1) | camera/agfa-ambi-silette-1956 | 15 | 0 |  |
| 15 | Canon EOS 100D | camera/canon-eos-100d-2013 | 15 | 0 |  |
| 16 | Canon EOS R50 | camera/canon-eos-r50-2023 | 15 | 0 |  |
| 17 | Canon EOS 700D (EOS Rebel T5i / EOS Kiss X7i) | camera/canon-eos-700d-eos-rebel-t5i-eos-kiss-x7i-2013 | 14 | 0 |  |
| 18 | Contax 645 AF | camera/contax-645-af-1999 | 14 | 0 |  |
| 19 | Canon EOS R8 | camera/canon-eos-r8-2023 | 14 | 0 |  |
| 20 | Canon EOS R10 | camera/canon-eos-r10-2022 | 14 | 0 |  |

### Top 15 systems by view_count

| # | System | Views |
| --- | --- | --- |
| 1 | M42 | 226 |
| 2 | Nikon F | 168 |
| 3 | Leica R | 162 |
| 4 | Pentax 6×7 | 112 |
| 5 | Leica Screw Mount (M39 / LTM) | 108 |
| 6 | Canon EF | 106 |
| 7 | Pentax K | 94 |
| 8 | Leica M | 83 |
| 9 | Minolta/Sony A | 80 |
| 10 | Bronica SQ | 80 |
| 11 | Canon FD | 79 |
| 12 | Contax/Yashica | 72 |
| 13 | Rolleiflex SLX / 6000 | 69 |
| 14 | Bronica ETR | 67 |
| 15 | Mamiya RB67 | 66 |

### Collections (no view counter exists; ranked by size, top 30 of 50)

| Collection | Slug | Lenses | Has description |
| --- | --- | --- | --- |
| Macro 1:1 | macro-1-1 | 109 | yes |
| Canon L-series lenses | canon-l-series-lenses | 102 | no |
| Fisheye lenses | fisheye-lenses | 101 | yes |
| Macro 1:1 | macro | 99 | no |
| Macro 1:2 | macro2 | 98 | no |
| Macro 1:2 | macro-1-2 | 95 | yes |
| Ultra-fast lenses | ultra-fast-lenses | 90 | yes |
| Leica M special limited editions | leica-m-special-limited-editions | 80 | yes |
| Leica M limited special editions | leica-m-limited-special-editions | 79 | yes |
| Fisheye lenses | fisheyes | 78 | no |
| Soviet lenses | soviet-lenses | 75 | yes |
| Pancake lenses | pancake-lenses | 73 | yes |
| Japanese rangefinder revival of 1990s-2000s | japanese-rangefinder-revival-of-1990s-2000s | 68 | yes |
| Mirror/Reflex lenses | mirror-reflex-lenses | 61 | yes |
| Tamron Adaptall-2 lenses | tamron-adaptall-2-lenses | 53 | yes |
| Nifty forties | nifty-forties | 52 | yes |
| Tamron Adaptall-2 | tamron-adaptall-2 | 51 | no |
| Same optical design | same-optical-design | 48 | no |
| Shift lenses | shift-lenses | 47 | yes |
| Compact, lightweight & fast AF primes | compact-lightweight-fast-af-primes | 45 | yes |
| Sigma Global Vision | sigma-global-vision | 44 | no |
| Nifty fourties | nifty-fourties | 42 | no |
| Anniversary lenses | anniversary-lenses | 39 | no |
| T-mount lenses | t-mount-lenses | 38 | no |
| Bellows lenses | bellows-lenses | 31 | no |
| Triplets | triplets | 29 | yes |
| Pentax special limited editions | pentax-special-limited-editions | 28 | yes |
| Pentax star lenses | pentax-star-lenses | 27 | no |
| Carl Zeiss special limited editions | carl-zeiss-special-limited-editions | 24 | yes |
| Tamron Adaptall | tamron-adaptall | 22 | no |

33/50 collections have a description, 3 are empty, and several are duplicated under two slugs. Series: 124, all described (avg 290 chars), none empty. Tags: 0.

### Ratings

- Lens ratings: 439 on 396 lenses (4.1%), average 5.01/10, 2026-03-09 → 2026-09-02. Camera ratings: 53 on 45 cameras, average 7.26.
- Monthly volume is growing (2026-03: 50, 2026-04: 29, 2026-05: 63, 2026-06: 86, 2026-07: 98, 2026-08: 109, 2026-09: 4); the busiest single IP hash cast 8 ratings, so this is not one actor.

| Rating | Count |
| --- | --- |
| 1 | 95 |
| 2 | 88 |
| 3 | 41 |
| 4 | 14 |
| 5 | 14 |
| 6 | 11 |
| 7 | 16 |
| 8 | 32 |
| 9 | 35 |
| 10 | 93 |

| Ratings per lens | Lenses |
| --- | --- |
| 0 | 9,187 |
| 1 | 360 |
| 2-4 | 27 |
| 5-9 | 1 |

### Comparisons

54 lens pairs with 136 total views; 14 camera pairs with 17 views.

| Lens 1 | Lens 2 | Views | Last |
| --- | --- | --- | --- |
| Canon 35mm F/2 II | Nikon AF Nikkor 35mm F/2D | 39 | 2026-08-25 |
| Nikon AF-S Nikkor 85mm F/1.8G | Sigma 85mm F1.4 DG DN Art | 9 | 2026-09-02 |
| Canon FDn 35mm F/2 | Nikon Nikkor-O·C 35mm F/2 | 7 | 2026-08-07 |
| Leica Noctilux-M 50mm F/0.95 ASPH. | Leica M 35mm F1.2 Noctilux Asph. | 7 | 2026-08-16 |
| Canon 19mm F/3.5 | Canon 19mm F/3.5 LSM | 6 | 2026-08-23 |
| Panasonic Leica DG Summilux 9mm F1.7 ASPH | Panasonic Lumix G 20mm F1.7 ASPH | 5 | 2026-07-23 |
| Canon EF 24-105mm F/4L IS USM | Canon RF 24-105mm F/4L IS USM | 5 | 2026-08-03 |
| Carl Zeiss Jena DDR Biometar 80mm F/2.8 Type 2 | Carl Zeiss Jena DDR BIOMETAR 80mm F/2.8 | 5 | 2026-08-18 |
| smc Pentax 67 55mm F/4 | smc Pentax 6×7 55mm F/4 | 3 | 2026-09-01 |
| Sony 16mm F/2.8 Fisheye (SAL16F28) | 7Artisans 35mm F/1.4 III | 2 | 2026-07-24 |
| Sigma 35mm F/1.4 DG DN \| A "Sigma China 10th Anniversary" | Angenieux Paris 45-90mm F/2.8 for Leicaflex / Leica R | 2 | 2026-07-28 |
| Canon FD 35mm F/2 S.S.C. [II] | Nikon AI Nikkor 35mm F/2 | 2 | 2026-05-14 |
| Canon FD 24mm F/1.4 S.S.C. Aspherical | Canon FDn 24mm F/1.4L | 2 | 2026-08-11 |
| Nikon NIKKOR Z 20mm F/1.8 S | Tamron 17-28mm F/2.8 Di III RXD A046 | 2 | 2026-08-28 |
| Nikon AF Nikkor 35mm F/2 | Nikon AF Nikkor 35mm F/2D | 1 | 2026-03-09 |
| Canon 35mm F/2 II | Nikon AF Nikkor 35mm F/2 | 1 | 2026-03-10 |
| Asahi SMC Takumar 50mm F/1.4 | Carl Zeiss C/Y Planar T* 50mm F/1.4 Gold (CONTAX 50 Years) (AE) | 1 | 2026-03-11 |
| Minolta MC Tele Rokkor-HF 300mm F/4.5 | Olympus OM F.Zuiko Auto-T 300mm F/4.5 [MC] | 1 | 2026-07-27 |
| Canon FD 300mm F/5.6 S.S.C. | Minolta MC Tele Rokkor-HF 300mm F/4.5 | 1 | 2026-07-27 |
| Canon RF 24-70mm F/2.8L IS USM | Canon RF 28-70mm F/2.8 IS STM | 1 | 2026-03-11 |

| Camera 1 | Camera 2 | Views | Last |
| --- | --- | --- | --- |
| Nikon F4 | Nikon F6 | 3 | 2026-05-19 |
| Sony a6700 | Panasonic Lumix DMC-G85 (Lumix DMC-G80) | 2 | 2026-08-14 |
| Nikon F4 | Nikon N90 | 1 | 2026-03-09 |
| Nikon F100 | Nikon F6 | 1 | 2026-03-09 |
| Nikon F100 | Nikon F5 | 1 | 2026-03-09 |
| Nikon F5 | Nikon FE2 | 1 | 2026-03-09 |
| Nikon FE | Nikon FE2 | 1 | 2026-03-09 |
| Nikon FE | Nikon FM10 | 1 | 2026-03-19 |
| Nikon F4 | AFIOM Kristall 2a | 1 | 2026-04-07 |
| Fujifilm X-E2 | Fujifilm X-H1 | 1 | 2026-04-12 |

## F. Community

| Role | Users | Email verified | Banned | Sum edit_count | First signup | Last signup |
| --- | --- | --- | --- | --- | --- | --- |
| user | 35 | 34 | 0 | 1871 | 2026-03-30 | 2026-08-31 |
| admin | 1 | 1 | 0 | 63 | 2026-03-25 | 2026-03-25 |
| trusted | 1 | 1 | 0 | 184 | 2026-03-25 | 2026-03-25 |

### Revisions by month (last 12 months; months with no revisions omitted)

| Month | Revisions | By user | Anonymous | Distinct users |
| --- | --- | --- | --- | --- |
| 2026-03 | 184 | 184 | 0 | 1 |
| 2026-04 | 66 | 66 | 0 | 2 |
| 2026-08 | 160 | 160 | 0 | 4 |
| 2026-09 | 1811 | 1706 | 105 | 1 |

Total 2,221 revisions (lens: 2,154 on 1,576 entities; camera: 67 on 55 entities), 0 reverts, 100.0% patrolled, 7 distinct users.

| Editor | Role | Revisions |
| --- | --- | --- |
| DPReview Watcher | user | 1862 |
| Sam | trusted | 184 |
| (anonymous) |  | 105 |
| Florent | admin | 63 |
| Stanley Goldman | user | 3 |
| Kaz | user | 2 |
| MarioMax58 | user | 1 |
| Luis | user | 1 |

### Pending edits, reports, flags, submissions

| pending_edits status | n | First | Last |
| --- | --- | --- | --- |
| approved | 560 | 2026-03-25 | 2026-09-02 |
| rejected | 12 | 2026-09-01 | 2026-09-01 |
| pending | 2 | 2026-09-01 | 2026-09-02 |

| issue_reports status | n |
| --- | --- |
| dismissed | 3 |
| pending | 1 |
| accepted | 5 |

| duplicate_flags status | n |
| --- | --- |
| confirmed | 28 |
| dismissed | 1 |

| dpreview_lens_candidates status | n |
| --- | --- |
| matched | 1263 |
| imported | 143 |
| pending | 13 |

Public submissions: 1 lens and 0 cameras carry a `submitted_by_ip`; no rows are unverified (the `verified` flag is effectively dead).

## G. Prices

| Entity | Estimates | With median price | With range | With rarity | Stale >60d | Stale >180d | First extracted | Last extracted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| camera | 2,189 | 1,879 (85.8%) | 1,879 | 2,189 | 2 | 0 | 2026-04-25 | 2026-08-31 |
| lens | 9,426 | 7,719 (81.9%) | 7,719 | 9,426 | 1 | 0 | 2026-04-19 | 2026-08-30 |

- 98.4% of live lenses have an estimate row (9,420); 6 estimates sit on merged lenses. Source: eBay (11,615). Estimates were (re)stamped almost entirely in 2026-08 (11,612 rows).
- `price_history`: 142,966 rows, all from eBay. Lens: 94,532 sales across 7,719 lenses, sale dates 2016-12-08 → 2026-07-22, last extraction 2026-07-23. Camera: 48,434 sales across 1,879 cameras, last extraction 2026-07-23. Median 9 sales per lens, max 78.
- Last successful update: estimates 2026-08-30 (lens) / 2026-08-31 (camera); sale history 2026-07-23 — the history feed has been idle for ~6 weeks while estimates were refreshed.

| Median price (USD) | Lenses |
| --- | --- |
| <50 | 1,249 |
| 50-199 | 2,751 |
| 200-499 | 1,990 |
| 500-999 | 900 |
| 1000-2999 | 625 |
| 3000+ | 204 |

## H. Data-quality smells

### Duplicate-looking lens names (same brand, same name after stripping non-alphanumerics) — top 20 of 103 groups / 207 lenses

| Brand | n | Names [id] |
| --- | --- | --- |
| Minolta | 3 | Minolta MC W.Rokkor (SG) 28mm F/3.5 [#4001] \| Minolta MC W.Rokkor-SG 28mm F/3.5 [#4015] \| Minolta MC W.Rokkor[-SG] 28mm F/3.5 [#4017] |
| 7Artisans | 2 | 7Artisans AF 24mm F/1.8 [#18237] \| 7Artisans AF 24mm F1.8 [#20507] |
| Angénieux | 2 | Angenieux Paris 28mm F/3.5 [Retrofocus] Type R11 [#18257] \| Angenieux Paris 28mm F/3.5 Retrofocus Type R11 [#18258] |
| Angénieux | 2 | P. Angenieux 45-90mm F/2.8 for Leicaflex (Leica R) [#5165] \| P. Angenieux 45-90mm F/2.8 for Leicaflex / Leica R [#5166] |
| Angénieux | 2 | P. Angenieux Paris 35mm F/2.5 [Retrofocus] Type R1 [#5189] \| P. Angenieux Paris 35mm F/2.5 Retrofocus Type R1 [#5190] |
| Angénieux | 2 | P. Angenieux Paris 28mm F/3.5 [Retrofocus] Type R11 [#5186] \| P. Angenieux Paris 28mm F/3.5 Retrofocus Type R11 [#5187] |
| Canon | 2 | Canon FL 50mm F/1.4 (II) [#875] \| Canon FL 50mm F/1.4 II [#877] |
| Carl Zeiss | 2 | Carl Zeiss Planar [T*] 100mm F/3.5 C [#1416] \| Carl Zeiss Planar T* 100mm F/3.5 C [#1417] |
| Carl Zeiss | 2 | Carl Zeiss Planar T* 80mm F/2.8 CF (Hasselblad Camera Manufacturers for 50 Years) [#1443] \| Carl Zeiss Planar T* 80mm F/2.8 CF "Hasselblad Camera Manufacturers for 50 Years" [#1446] |
| Carl Zeiss | 2 | Carl Zeiss C/Y Planar T* 135mm F/2 (CONTAX 60 Years) (MM) [#1087] \| Carl Zeiss C/Y Planar T* 135mm F/2 “CONTAX 60 Years” [MM] [#1089] |
| Carl Zeiss | 2 | Carl Zeiss Planar [HFT] 80mm F/2.8 [#1407] \| Carl Zeiss Planar HFT 80mm F/2.8 [#1408] |
| Carl Zeiss | 2 | Carl Zeiss Jena DDR BIOTAR 58mm F/2 T [#18415] \| Carl Zeiss Jena DDR BIOTAR 58mm F/2 [T] [#18417] |
| Carl Zeiss | 2 | Carl Zeiss Jena Biotar 75mm F/1.5 T [#1246] \| Carl Zeiss Jena BIOTAR 75mm F/1.5 [T] [#18410] |
| Carl Zeiss | 2 | Carl Zeiss Planar T* 80mm F/2.8 CF (Hasselblad System 50th Anniversary) [#1444] \| Carl Zeiss Planar T* 80mm F/2.8 CF "Hasselblad System 50th Anniversary" [#1447] |
| Carl Zeiss | 2 | Carl Zeiss Distagon [HFT] 40mm F/4 [#1166] \| Carl Zeiss Distagon HFT 40mm F/4 [#1167] |
| Cosina | 2 | Cosina Voigtlander Ultron 35mm F/2 Aspherical VM (Type 2) [#1936] \| Cosina Voigtlander Ultron 35mm F/2 Aspherical VM Type 2 [#1938] |
| Cosina | 2 | Cosina Voigtlander Ultron 35mm F/2 Aspherical VM (Type 1) [#1935] \| Cosina Voigtlander Ultron 35mm F/2 Aspherical VM Type 1 [#1937] |
| Cosina | 2 | Cosina Voigtlander Ultron 28mm F/2 Aspherical VM (Type 2) [#1924] \| Cosina Voigtlander Ultron 28mm F/2 Aspherical VM Type 2 [#1927] |
| Cosina | 2 | Cosina Voigtlander Ultron 28mm F/2 Aspherical VM (Type 1) [#1925] \| Cosina Voigtlander Ultron 28mm F/2 Aspherical VM Type 1 [#1926] |
| Cosina | 2 | Cosina Voigtlander Heliar 50mm F/2 VM (Voigtlander 250th Anniversary) [#1818] \| Cosina Voigtlander Heliar 50mm F/2 VM “Voigtlander 250th Anniversary” [#1819] |

Folding bracketed suffixes as well gives 139 groups / 297 lenses. The pattern is overwhelmingly "same lens, different punctuation" ("[T]" vs "T", "(Type 2)" vs "Type 2"). Cameras:

| Normalised | n | Names [id] |
| --- | --- | --- |
| leicam3gold | 3 | Leica M3 Gold [#3678] \| Leica M3 Gold [#637] \| Leica M3 Gold [#636] |
| exakta66 | 3 | Exakta 66 [#351] \| Exakta 6×6 [#353] \| Exakta 66 [#352] |
| leicam6goldsultanofbrunei | 2 | Leica M6 Gold "Sultan of Brunei" [#662] \| Leica M6 Gold "Sultan of Brunei" [#661] |
| leicam6platinumsultanofbrunei | 2 | Leica M6 Platinum "Sultan of Brunei" [#675] \| Leica M6 Platinum "Sultan of Brunei" [#676] |
| mamiya645df | 2 | Mamiya 645DF+ [#792] \| Mamiya 645DF [#791] |
| pentax67 | 2 | Pentax 6×7 [#1075] \| Pentax 67 [#1072] |
| pixiimodela2572 | 2 | Pixii (Model A2572) [#3603] \| Pixii+ (Model A2572+) [#3604] |
| yashica109multiprogram | 2 | Yashica 109 Multi Program [#1398] \| Yashica 109 Multi Program [#1397] |
| hasselbladlunarlimitededition | 2 | Hasselblad Lunar Limited Edition [#3373] \| Hasselblad Lunar Limited Edition [#3374] |

### Names lacking a focal-length or aperture pattern

- 397 lens names (4.1%) contain no "NNmm"; 344 (3.6%) contain no "f/N" / "1:N". Nearly all are teleconverters, extenders, adapters, bellows and cine T-stop lenses filed in the `lenses` table, e.g.: "Canon Extender FD 1.4X-A", "Minolta MD 2X Tele Converter 300-L", "Asahi Pentax 6×7 Rear Converter T6-2X", "Asahi Pentax Bellows II (double-track)", "Spiratone Auxiliary Fisheye Lens 0.15X (Accura, Kalcor, Panagor, Soligor)", "Canon Control Ring Mount Adapter EF – EOS R".
- 1,558 lenses (16.3%) have a `name` that does not start with their `brand` ("smc Pentax-A 28mm F/2" / Pentax, "Asahi Super-Takumar" / Pentax, "Carl Zeiss Jena DDR …" / Carl Zeiss, "[Auto] Tamron-F" / Tamron) — display names and brand are not normalised against each other.

### Missing links and out-of-range values

| Check | Count |
| --- | --- |
| Cameras with NULL system_id | 65 |
| Lenses with NULL system_id | 64 |
| Lenses with year_introduced < 1900 or > 2026 | 0 |
| Cameras with year < 1900 or > 2026 | 0 |
| Lenses discontinued before introduced | 0 |
| aperture_min > aperture_max | 1 |
| aperture_min outside 0.5–32 | 2 |
| weight_g outside 20–10000 g | 16 |
| lens_groups > lens_elements | 4 |
| Neither is_zoom nor is_prime | 419 |
| Price estimates on merged lenses | 6 |
| Primary mount missing from lens_systems | 0 |
| Systems with 0 lenses (any mount) and 0 cameras | 6 |
| Systems with no mount_type | 132 of 132 |
| Systems with no description | 2 |

Empty systems: Agfa Ambiflex (agfa-ambiflex), Fujita 66 / Kalimar Reflex (fujita-66-kalimar-reflex), Kowa SE/SET R (kowa-se-set-r), Pentacon super (pentacon-super), Voigtlander Vitessa T (voigtlander-vitessa-t), Yashica AF (yashica-af). Lenses without a system are real products, e.g. "Coastal Opt 60mm F/4 UV-VIS-IR Apo Macro (Jenoptik)", "Spiratone Auxiliary Fisheye Lens 0.15X (Accura, Kalcor, Panagor, Soligor)", "Leitz Wetzlar Elmarit 90mm F/2.8", "Tamron SP AF 90mm F/2.8 Di Macro 1:1 272E".

### Empty-string vs NULL

| Column | NULL | Empty string / {} / [] |
| --- | --- | --- |
| lenses.description | 3,680 | 0 |
| lenses.brand | 0 | 0 |
| lenses.lens_type | 76 | 0 |
| lenses.url | 558 | 0 |
| lenses.era | 2,726 | 0 |
| lenses.coverage | 8,025 | 0 |
| lenses.specs | 0 | 12 |
| lenses.images | 0 | 8,007 |
| cameras.description | 2,176 | 0 |
| cameras.sensor_size | 11 | 0 |
| cameras.body_type | 1,500 | 0 |
| systems.description | 2 | 0 |

Top-level text columns use NULL consistently (no empty strings). The inconsistency lives inside `specs`: 23,564 empty-string values plus "<No information>" / "<No data>" / "Not available for your region" / "-" placeholders that read as data.

### Slugs

| Entity | Slugs not matching ^[a-z0-9]+(-[a-z0-9]+)*$ | Sample |
| --- | --- | --- |
| lens | 0 |  |
| camera | 2,181 | camera/yashica-107-multi-program-1988, camera/sony-a7r-iii-2017, camera/canon-eos-rebel-t4i-eos-650d-eos-kiss-x6i-2012, camera/leica-m-ara-guler-2016, camera/yashica-fx-1-1974, camera/zenit-e-1965, camera/olympus-e-1-2003, camera/panasonic-lumix-dmc-g2-2010, camera/cosina-voigtlander-bessa-r2c-2002, camera/leica-m11-p-safari-2025 |
| system | 0 |  |

Every non-conforming camera slug is the literal prefix `camera/` (2,181 of 2,189; the remaining 8 have no prefix). The app serves them through `app/cameras/[...slug]`, so public URLs read `/cameras/camera/nikon-f6-2004`. Lens and system slugs are clean.

### Vocabulary drift

- `coverage`: 17 distinct non-null values for about five concepts (see section D).
- `era`: "Film era" / "Digital era" plus leaked values "Pro", "vintage", "Digital", and seven "Announced in …" strings.
- `production_status`: "Discontinued" / "In production" plus "Film era", "Digital era", "Collectible", lowercase "discontinued", and mount-suffixed variants such as "Discontinued (Canon EF-M, Canon RF)".
- `lens_type`: generic "Prime lens" (1,966) alongside fine-grained classes; lowercase "teleconverter" / "accessory"; "Body cap lenses" plural.
- Cameras: `sensor_size` "35mm full frame" vs "Full frame"; `body_type` mixes shutter type and body style.
- Collections: "Macro 1:1" ×2, "Macro 1:2" ×2, "Fisheye lenses" ×2, "Nifty forties"/"Nifty fourties", three Tamron Adaptall variants, two Leica M limited-edition variants.

### Provenance

| Lens url host | n |
| --- | --- |
| lens-db.com | 8,859 |
| www.dpreview.com | 155 |
| explore.omsystem.com | 1 |
| learnandsupport.getolympus.com | 1 |
| camera-wiki.org | 1 |

| Camera url host | n |
| --- | --- |
| lens-db.com | 1,974 |

## I. Encyclopedia gaps on the pages people actually open

### Top 200 lenses by view_count (3,923 views, 9.3% of all lens views)

| Missing | Lenses (of 200) | % |
| --- | --- | --- |
| (a) image | 178 | 89.0% |
| (b) description ≥ 200 chars | 35 | 17.5% |
|     any description | 22 | 11.0% |
| (c) year_introduced | 31 | 15.5% |
| (d) weight | 12 | 6.0% |
| (e) price estimate | 0 | 0.0% |
| filter size | 49 | 24.5% |
| diaphragm blades | 38 | 19.0% |
| min focus distance | 6 | 3.0% |
| elements | 6 | 3.0% |
| any compatibility row | 200 | 100.0% |
| any rating | 146 | 73.0% |
| **at least one of (a)–(e)** | 184 | 92.0% |
| **complete on all of (a)–(e)** | 16 | 8.0% |

### Completeness by view tier

| Tier | Lenses | % image | % desc ≥200 | % year | % weight | % filter | % elements | % price | % compat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| top 200 | 200 | 11.5 | 81.0 | 85.0 | 94.5 | 75.0 | 97.0 | 100.0 | 0.0 |
| 201-1000 | 800 | 12.6 | 75.0 | 86.8 | 90.3 | 74.6 | 95.1 | 100.0 | 0.0 |
| 1001-5000 | 4,000 | 15.4 | 59.4 | 84.9 | 86.1 | 68.2 | 91.8 | 100.0 | 0.0 |
| rest | 4,575 | 19.2 | 39.2 | 79.7 | 79.6 | 56.4 | 88.2 | 96.6 | 0.0 |

Text and numeric specs *are* better on popular pages (curated vintage catalogue); images are *worse* there.

### Top 50 cameras by view_count

| Missing | Cameras (of 50) |
| --- | --- |
| image | 25 |
| description ≥ 200 chars | 49 |
| year | 0 |
| weight | 3 |
| megapixels (incl. film bodies) | 26 |
| sensor/film format | 0 |
| price estimate | 0 |

### The 40 most-viewed lenses that fail at least one of (a)–(e)

| Views | Lens | Slug | Image | Desc ≥200 | Year | Weight | Price |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 127 | [Auto] Tamron-F 28mm F/2.8 | auto-tamron-f-28mm-f28 | ✗ | ✓ | ✗ | ✓ | ✓ |
| 115 | Carl Zeiss N-Mirotar 210mm F/0.03 | carl-zeiss-n-mirotar-210mm-f003-1977 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 78 | Nikon AF Nikkor 35mm F/2D | nikon-af-nikkor-35mm-f2d-1995 | ✓ | ✗ | ✓ | ✓ | ✓ |
| 77 | 7Artisans 4mm F/2.8 Fisheye | 7artisans-4mm-f28-fisheye-2022 | ✓ | ✗ | ✓ | ✓ | ✓ |
| 60 | Minolta Auto Rokkor-PF 58mm F/1.4 | minolta-auto-rokkor-pf-58mm-f14-1961 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 56 | Helios-44-2 58mm F/2 | helios-44-2-58mm-f2 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 54 | Leica (Leitz Wetzlar, Leitz Canada) Elmarit-R 135mm F/2.8 | leica-elmarit-r-135mm-f28-1968 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 44 | Mamiya-SEKOR 58mm F/1.7 | mamiya-sekor-58mm-f17-1964 | ✗ | ✗ | ✓ | ✗ | ✓ |
| 40 | Vivitar 80-200mm F/4.5 MC Macro | vivitar-80-200mm-f45-mc-macro-sn-77xxxxxx-1982 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 29 | smc Pentax-A 28mm F/2 | smc-pentax-a-28mm-f2-1983 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 27 | APO Mamiya A 200mm F/2.8 | apo-mamiya-a-200mm-f28-1996 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 27 | Mamiya-Sekor Shift C 50mm F/4 | mamiya-sekor-shift-c-50mm-f4 | ✗ | ✓ | ✗ | ✓ | ✓ |
| 27 | Canon Serenar 50mm F/3.5 II | canon-serenar-50mm-f35-ii-1952 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 27 | 7Artisans 6mm F/2 Fisheye | 7artisans-6mm-f2-fisheye-2025 | ✗ | ✗ | ✓ | ✓ | ✓ |
| 26 | Mamiya Macro A 120mm F/4 M | mamiya-macro-a-120mm-f4-m | ✗ | ✓ | ✗ | ✓ | ✓ |
| 26 | Helios-81N 50mm F/2 MC | helios-81n-50mm-f2-mc | ✗ | ✓ | ✓ | ✓ | ✓ |
| 25 | Minolta RF Rokkor 1600mm F/11 | minolta-rf-rokkor-1600mm-f11-1974 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 25 | Tamron SP 500mm F/8 Mirror 55B | tamron-sp-500mm-f8-mirror-55b-1979 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 25 | Asahi Super-Takumar 35mm F/2 | asahi-super-takumar-35mm-f2-1963 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 24 | Canon FD 300mm F/4L | canon-fd-300mm-f4l-1978 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 23 | Mamiya-Sekor C 80mm F/1.9 N | mamiya-sekor-c-80mm-f19-n | ✗ | ✓ | ✗ | ✓ | ✓ |
| 23 | Carl Zeiss Jena DDR Sonnar 135mm F/3.5 [electric] MC | carl-zeiss-jena-ddr-sonnar-135mm-f35-electric-mc-1976 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 23 | Zoomar Muenchen Super Zoomatar 240mm F/1.2 | zoomar-muenchen-super-zoomatar-240mm-f12-1970 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 23 | Yashica DSB 38-90mm F/3.5 | yashica-dsb-38-90mm-f35 | ✗ | ✓ | ✗ | ✓ | ✓ |
| 22 | Auto Chinon 28mm F/2.8 MC | auto-chinon-28mm-f28-mc | ✗ | ✗ | ✗ | ✓ | ✓ |
| 22 | Fuji Photo Film X-Fujinar-T 135mm F/2.8 DM | fuji-photo-film-x-fujinar-t-135mm-f28-dm-1981 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 22 | [Auto] Tamron-F 200mm F/3.5 | auto-tamron-f-200mm-f35 | ✗ | ✓ | ✗ | ✓ | ✓ |
| 22 | Carl Zeiss Jena DDR Biometar 80mm F/2.8 [MC] | carl-zeiss-jena-ddr-biometar-80mm-f28-mc-1959 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 22 | Leica (Leitz Wetzlar) Macro-Elmarit-R 60mm F/2.8 | leica-macro-elmarit-r-60mm-f28-1970 | ✗ | ✓ | ✓ | ✗ | ✓ |
| 22 | Cosina Auto Cosinon 50mm F/1.8 | cosina-auto-cosinon-50mm-f18-1970 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 21 | Auto Sears 55mm F/2.8 Macro | auto-sears-55mm-f28-macro | ✗ | ✗ | ✗ | ✗ | ✓ |
| 21 | Sigma MF 1000mm F/13.5 Mirror | sigma-mf-1000mm-f135-mirror-1981 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 21 | Auto Mamiya/Sekor SX 21mm F/4 | auto-mamiya-sekor-sx-21mm-f4-1974 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 21 | Olympus OM Zuiko Shift 35mm F/2.8 | olympus-om-zuiko-shift-35mm-f28-1972 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 21 | Carl Zeiss F-Distagon 30mm F/3.5 C | carl-zeiss-f-distagon-30mm-f35-c | ✗ | ✓ | ✗ | ✓ | ✓ |
| 21 | Bronica Zenzanon-PE 45-90mm F/4-5.6 Aspherical | bronica-zenzanon-pe-45-90mm-f4-56-aspherical-1998 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 21 | Canon EF 600mm F/4L USM | canon-ef-600mm-f4l-usm-1988 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 20 | Nikon AI-S Nikkor 800mm F/5.6 IF-ED | nikon-ai-s-nikkor-800mm-f56-if-ed-1986 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 20 | Cosina 24mm F/2.8 MC Macro | cosina-24mm-f28-mc-macro | ✗ | ✓ | ✗ | ✓ | ✓ |
| 20 | Kino Precision Kiron 28-85mm F/2.8-3.8 MC Macro | kino-precision-kiron-28-85mm-f28-38-mc-macro-1980 | ✗ | ✓ | ✓ | ✓ | ✓ |

## Recommended data-enrichment priorities

Ordered by (gap size × visibility × ease). Each item names the fields, the size of the hole, and plausible sources.

1. **Images for the pages that matter (lenses first, then cameras).** 7,957 lenses and 1,454 cameras have none; 178/200 top lenses. Sources: Wikimedia Commons (CC-licensed product photos exist for most classic Nikkor/Takumar/Rokkor/Zeiss/Leica lenses and virtually every notable camera body), manufacturer press/asset pages for the 1,049 in-production lenses, DPReview product galleries for post-2000 gear (already used for 1,419 candidates), and a community upload flow with a CC-BY-SA requirement. Store attribution alongside `{alt, src}`.
2. **Promote parseable `specs` into columns and purge placeholders.** Zero-cost wins: `max_magnification` from "Magnification ratio" (+3,436 lenses), a new `length_mm`/`diameter_mm` pair from "Maximum diameter x Length" (7,962 lenses), `has_autofocus` from "Focusing modes" (8,469), flange distance from "Mount and Flange focal distance" (6,980), film type for cameras from "Film type" (1,419). Convert empty strings and "<No information>"-style values to absent keys so the UI can show "unknown" honestly.
3. **Build the compatibility graph.** `lens_compatibility` is empty, yet a native mapping is derivable today: every lens in `lens_systems` × every camera with the same `system_id` (10,511 lens-mount rows × 2,122 mounted cameras). Add adapter rules per mount pair (flange distances are in `specs`) and crop/coverage flags. This single table turns product pages into a navigable wiki ("works on", "what fits my camera") and is what the compare/chat features need.
4. **Replace boilerplate and missing prose with sourced articles.** Rewrite the 519 shared texts as series-page content (they already are series descriptions) and give the 1,387 affected lenses plus the 4,645 lenses under 200 chars a per-lens "About" section. Sources: Wikipedia/Wikidata (notable lenses and nearly all cameras have articles: Nikon F6, D850, F3/F4, Exakta Varex, Helios-44 …), camera-wiki.org (CC-BY-SA, deep on vintage bodies and mounts), manufacturer history pages (Nikon "1001 Nights", Pentax/Ricoh lens histories, Leica archives), and LLM-drafted summaries **strictly from structured specs + cited sources** with human review through the existing `pending_edits` flow. Cameras are the emergency: 2,174 of 2,187 have nothing.
5. **Normalise the controlled vocabularies before building facets.** `coverage` → 5 values (full-frame, aps-c, micro-four-thirds, medium-format, other/1"), `era` and `production_status` → their intended enums (move "Announced in …" into year fields), `lens_type` → one taxonomy (type × focal class), `body_type` split into body style vs shutter type, `sensor_size` deduplicated. Give `systems` a `mount_type` (bayonet/screw/breech, 0/132 today) and a real description (6/132 have 200+ chars) — Wikipedia mount articles cover every major system.
6. **Camera specifics.** `sensor_type` for 445 digital bodies (DPReview spec pages, Wikipedia infoboxes), `body_type` for 1,498, `weight_g` for 510, aliases/regional names (only 7 have one though names like "EOS 700D (Rebel T5i / Kiss X7i)" show the need), `year_discontinued` (7 lenses, no camera column).
7. **Deduplicate and canonicalise identity.** Merge the 103–139 duplicate lens groups and the duplicated cameras/collections; normalise `name` vs `brand` (1,558 mismatches); populate `lens_version_groups` (1 today) using the "Type/II/III/[T]" name patterns and the shared-description clusters; move teleconverters/adapters/bellows (323 rows) out of the lens namespace or flag them; assign the 65 system-less cameras; strip the `camera/` slug prefix with redirects.
8. **Keep prices alive and complete.** Restart the `price_history` feed (idle since 2026-07-23), fill the 1,707 rarity-only lens estimates, add a second source beyond eBay (KEH/MPB/Japanese auction aggregators) so the "what you'd pay" number is defensible. This is the site's differentiator versus Wikipedia — protect it.
9. **Instrument real demand before investing further.** Replace `view_count` as a prioritisation signal with PostHog page views, internal search queries and referrers; the current counter is crawler-shaped. Rank enrichment work by human traffic once it is measurable.
10. **Design the community, don't assume it.** 37 users, 2 real editors, 1 public submission in six months. The wiki ambition needs: attribution/licensing for the lens-db.com-derived corpus (98.2% of source URLs), a talk/discussion surface, a lightweight "add a photo / fix a spec" flow that does not require an account, and a patrol queue that already exists (`pending_edits`, `issue_reports`, `duplicate_flags`) surfaced in the UI.
