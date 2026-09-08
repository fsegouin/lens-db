-- Eleven collections rendered a blank card on /collections. Ten of them hold
-- thousands of characters of the import's flattened member listing ("QUICK
-- JUMP TO:..." or a "DateMade by..." table) and no prose at all, so the
-- render-time sanitiser in src/lib/scraped-description.ts correctly keeps
-- nothing; the eleventh, bellows-lenses, was never given a description.
-- The listing is not information the page lacks, it is the member list the
-- page already prints underneath, so nothing is lost by replacing it.
--
-- Each update is guarded on the description still being the scrape (or null),
-- so a later hand edit through the admin form is never overwritten by a rerun.

UPDATE collections
SET description = 'Lens heads with no focusing mount of their own, sold to sit on a bellows unit. Nearly all are macro optics from the SLR makers of the 1960s and 1970s, with a few long telephotos that used the bellows for focus. Focus is by rail, so none of these is a walk-around lens.'
WHERE slug = 'bellows-lenses'
  AND (description IS NULL OR description = '');
--> statement-breakpoint

UPDATE collections
SET description = 'The rangefinder came back in Japan around 1999, when Cosina put the Voigtlander name on Bessa bodies and a run of screw-mount and M-mount lenses. Konica, Rollei, Ricoh and Nikon followed with their own, and the Zeiss ZM range came out of the same factory. Most of it was made by Cosina, whatever the badge.'
WHERE slug = 'japanese-rangefinder-revival-of-1990s-2000s'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Macro lenses that reach life size on their own, with no tube or bellows in between. The oldest date from the 1950s but most are from 1990 onward, when 1:1 became the norm rather than the exception. The half-size classics have the 1:2 collection, and anything past life size is in Beyond 1:1.'
WHERE slug = 'macro-1-1'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Macro lenses that stop at half life size and hand you an extension tube for the rest. This is how nearly every SLR maker built its 50mm and 100mm macro from the 1960s to the 1980s, so the list is a roll call of Micro-Nikkors, Macro Rokkors and Macro-Takumars. Their 1:1 successors have a collection of their own.'
WHERE slug = 'macro-1-2'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Catadioptric lenses, which fold the light path with two mirrors to fit 500mm and more into a short, light barrel. The price is a fixed aperture, usually f/8, and the ring-shaped highlights that give them away. The range runs from a 250mm Minolta to 2000mm, with the Soviet MTO and Rubinar designs alongside Nikon, Canon and Zeiss.'
WHERE slug = 'mirror-reflex-lenses'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Primes between 40mm and 45mm, the length that splits the difference between a 35 and a 50 and that the industry keeps rediscovering. Many are pancakes, since the focal length suits a thin design. The rest run from a 1933 Zeiss Biotar to the fast Sigma and Voigtlander primes of the last few years.'
WHERE slug = 'nifty-forties'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Lenses built to be unsharp on purpose, with spherical aberration left in or dialled in for portraits. Most let you set the degree of softness, by a ring, the aperture or a set of discs, from the 1930s Leitz Thambar and its 2017 reissue to the Minolta Varisoft and the Pentax Softs. The Mamiya and Pentax medium-format entries did the same job for the studio.'
WHERE slug = 'soft-focus-lenses'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Lenses from the Soviet optical plants, sold under design names rather than factory names: Jupiter, Helios, Mir, Zenitar. Several began as copies of pre-war Zeiss formulas taken as reparations and stayed in production for decades. From a 1947 Jupiter to the last lenses before 1991, plus the MTO and Rubinar mirror lenses. The natural sibling to the East German collection.'
WHERE slug = 'soviet-lenses'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Lenses built on the Cooke triplet, three elements in three groups, the simplest design that corrects every primary aberration. Cheap to make and prone to swirling, bubbly bokeh, which is why the Meyer Trioplan has a cult around it. Zeiss Triotars, Takumars, Petris and the second Leitz Elmar 90mm f/4 all belong here, from 1932 to 1969.'
WHERE slug = 'triplets'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Lenses of f/1.2 and faster, from the f/0.95 Canon of 1961 to the Noctilux, the Nikon Noct and an f/0.9 Voigtlander. Canon built more of them than anyone in the film era, then Cosina took over the job for mirrorless. Ninety lenses across seventy years. The Chinese fast primes have a collection of their own.'
WHERE slug = 'ultra-fast-lenses'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
--> statement-breakpoint

UPDATE collections
SET description = 'Lenses corrected or built for light the eye cannot see: quartz and fluorite elements that pass ultraviolet, and superachromats that hold focus from UV into the infrared. Most are Zeiss designs for Hasselblad, alongside the Pentax Ultra-Achromatic and Quartz Takumars, the UV-Nikkor and the Coastal Optics apochromat. Built for science and forensics first.'
WHERE slug = 'uv-ir-photography'
  AND (description IS NULL OR description LIKE 'QUICK JUMP TO:%' OR description LIKE 'DateMade by%');
