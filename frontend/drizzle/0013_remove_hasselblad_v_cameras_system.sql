-- Remove the bogus "List of Hasselblad V cameras" system row.
-- Its slug ("hasselblad-v/cameras") contains a slash which produced the
-- multi-segment URL /systems/hasselblad-v/cameras in the sitemap — a path
-- the single-segment /systems/[slug] route can't match, so Google sees a
-- 404. The row is not a real mount system; it appears to be a wiki list
-- page that got ingested as one. As of writing, no lenses or cameras are
-- assigned to it, so the delete is straightforward.
--
-- Idempotent: a name+slug match means reruns against an already-cleaned
-- database simply affect zero rows.

DELETE FROM systems
WHERE name = 'List of Hasselblad V cameras'
  AND slug = 'hasselblad-v/cameras';
