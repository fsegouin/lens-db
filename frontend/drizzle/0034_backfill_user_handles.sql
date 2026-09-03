-- Give every existing account a URL-safe handle for /kit/<handle>.
--
-- display_name is already unique, but it may hold spaces and punctuation that
-- do not belong in a path, and two different display names can slug down to
-- the same string ("Jean Dupont" and "jean-dupont"), so collisions are settled
-- by appending a number in id order. Accounts registered later get their
-- handle at registration.

WITH slugged AS (
  SELECT
    id,
    btrim(regexp_replace(lower(btrim(display_name)), '[^a-z0-9]+', '-', 'g'), '-') AS raw
  FROM users
  WHERE handle IS NULL
),
based AS (
  SELECT id, CASE WHEN raw = '' THEN 'member' ELSE raw END AS base
  FROM slugged
),
numbered AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS rn
  FROM based
)
UPDATE users u
SET handle = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || '-' || n.rn END
FROM numbered n
WHERE u.id = n.id
  AND u.handle IS NULL;
