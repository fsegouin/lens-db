-- Give the 13 remaining Autocords the lens they actually have.
--
-- Migration 0051 left every Autocord except the Autocord I without a built-in
-- lens, on the grounds that camera-wiki names the 75mm focal length only on
-- that one model. That was the wrong call. The Autocord was never sold with a
-- choice of lens: camera-wiki's family text says all of them shared "a highly
-- regarded Tessar-type 4-element Rokkor f/3.5", so there is one lens, and the
-- uncertainty is about a single field of it rather than about which lens the
-- camera has. Leaving 13 bodies with no lens at all misrepresented that as a
-- gap in the catalogue.
--
-- They now share the existing Minolta Rokkor 75mm F/3.5 row, as the Fuji 90mm
-- F/3.5 row is shared across the GW bodies. The focal length carries a field
-- citation saying where it is and is not confirmed, which is what
-- field_citations exists for.
--
-- The stale "Lens options" key is moved to "Notes": it never described a
-- choice, and leaving it under that name beside a linked lens would read as
-- though one existed.
--
-- Idempotent: the link is guarded on IS NULL and the specs edit is a no-op
-- once the key is gone.

UPDATE cameras c
SET built_in_lens_id = (SELECT id FROM lenses WHERE slug = 'minolta-rokkor-75mm-f-3-5')
WHERE c.built_in_lens_id IS NULL
  AND c.slug IN (
    'minolta-autocord-mxs-1955',
    'minolta-autocord-mxv-1955',
    'minolta-autocord-l-1955',
    'minolta-autocord-lmx-1958',
    'minolta-autocord-1958',
    'minolta-autocord-rg-i-1961',
    'minolta-autocord-rg-ii-1962',
    'minolta-autocord-rg-iii-1963',
    'minolta-autocord-cds-1965',
    'minolta-autocord-ii-1966',
    'minolta-autocord-iii-1966',
    'minolta-autocord-cds-ii-1966',
    'minolta-autocord-cds-iii-1966'
  );
--> statement-breakpoint

UPDATE cameras
SET specs = (specs - 'Lens options')
  || jsonb_build_object(
       'Notes',
       'camera-wiki describes the whole Autocord line as sharing a four-element Tessar-type Rokkor f/3.5, but states the 75mm focal length only for the Autocord I.'
     )
WHERE specs ? 'Lens options'
  AND specs->>'Lens options' LIKE 'Rokkor f/3.5%';
--> statement-breakpoint

INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
SELECT 'lens', l.id, 'focalLengthMin', 'camera-wiki', 'https://camera-wiki.org/wiki/Minolta_Autocord',
       'camera-wiki gives 75mm explicitly only for the Autocord I; the other bodies are described at family level as carrying the same four-element Rokkor f/3.5.'
FROM lenses l
WHERE l.slug = 'minolta-rokkor-75mm-f-3-5'
ON CONFLICT (entity_type, entity_id, field) DO NOTHING;
