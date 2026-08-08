-- Automatic sender learning has supplied a source since this cutoff. Older
-- exclusions and subject patterns only came from explicit user updates.
UPDATE "GroupItem"
SET "source" = 'USER'
WHERE "source" IS NULL
  AND (
    "exclude"
    OR "type" = 'SUBJECT'
    OR "updatedAt" >= TIMESTAMPTZ '2026-01-03 00:00:00+00'
  );

DELETE FROM "GroupItem"
WHERE btrim("value", E' \t\n\r\f\v') = '';

WITH ranked_items AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "groupId", "type", lower(btrim("value", E' \t\n\r\f\v'))
      ORDER BY
        coalesce("source" = 'USER', false) DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        "id" DESC
    ) AS rank
  FROM "GroupItem"
  WHERE "groupId" IS NOT NULL
)
DELETE FROM "GroupItem"
USING ranked_items
WHERE "GroupItem"."id" = ranked_items."id"
  AND ranked_items.rank > 1;

UPDATE "GroupItem"
SET "value" = lower(btrim("value", E' \t\n\r\f\v'))
WHERE "value" <> lower(btrim("value", E' \t\n\r\f\v'));
