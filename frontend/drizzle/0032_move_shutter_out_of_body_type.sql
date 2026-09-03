-- Move the shutter mechanism out of the body_type column.
--
-- 476 cameras record "Focal-plane", "In-lens leaf shutter" or "Leaf shutter"
-- in body_type. Those are shutter mechanisms, not body styles, and the camera
-- page renders body_type as a badge, so each of those pages asserted a body
-- style the record never held. The infobox already suppressed these values
-- (bodyStyle in the camera page), which hid the problem without fixing it.
--
-- The value is not preserved anywhere else: only 6 of the 476 carry a
-- 'Shutter' key in their raw specs. So it moves rather than being dropped.
--
-- body_type keeps the values that really are body styles: the SLR sizes and
-- the two mirrorless styles. It ends up filled on fewer cameras, which is the
-- honest count, since a shutter mechanism never told us the body style.

UPDATE cameras
SET shutter_type = body_type,
    body_type = NULL
WHERE body_type IS NOT NULL
  AND body_type ~* '(focal-plane|leaf shutter)'
  AND shutter_type IS NULL;

-- Settle the casing while the values are few and known.
UPDATE cameras SET shutter_type = 'Focal-plane'
WHERE shutter_type IS NOT NULL AND lower(shutter_type) = 'focal-plane';

UPDATE cameras SET shutter_type = 'Leaf shutter'
WHERE shutter_type IS NOT NULL AND lower(shutter_type) = 'leaf shutter';

UPDATE cameras SET shutter_type = 'In-lens leaf shutter'
WHERE shutter_type IS NOT NULL AND lower(shutter_type) = 'in-lens leaf shutter';
