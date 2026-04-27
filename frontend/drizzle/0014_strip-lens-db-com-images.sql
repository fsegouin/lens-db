-- Remove all image entries whose src points to lens-db.com
UPDATE lenses
SET images = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(images) AS elem
  WHERE NOT (elem->>'src' LIKE '%lens-db.com%')
)
WHERE images::text LIKE '%lens-db.com%';

UPDATE cameras
SET images = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(images) AS elem
  WHERE NOT (elem->>'src' LIKE '%lens-db.com%')
)
WHERE images::text LIKE '%lens-db.com%';
