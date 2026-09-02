-- Camera slugs carry a literal "camera/" prefix left over from the original
-- scrape, so 2,181 of 2,187 camera pages live at /cameras/camera/<name>. The
-- redundant segment is stripped here; /cameras/camera/:slug is redirected to
-- the clean path in next.config.ts so existing links keep working.
--
-- Safe to rerun: rows without the prefix are not matched, and the guard skips
-- any row whose stripped form is already taken (there are none today).

UPDATE cameras AS c
SET slug = regexp_replace(c.slug, '^camera/', '')
WHERE c.slug LIKE 'camera/%'
  AND NOT EXISTS (
    SELECT 1
    FROM cameras AS other
    WHERE other.id <> c.id
      AND other.slug = regexp_replace(c.slug, '^camera/', '')
  );
