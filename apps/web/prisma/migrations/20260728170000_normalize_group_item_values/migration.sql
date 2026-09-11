-- Legacy exclusions and subject patterns came from explicit user updates.
-- Sender inclusions with unknown ownership remain null and are protected by
-- the writer and matcher; update time does not establish provenance.
UPDATE "GroupItem"
SET "source" = 'USER'
WHERE "source" IS NULL
  AND (
    "exclude"
    OR "type" = 'SUBJECT'
  );

DELETE FROM "GroupItem"
WHERE btrim("value", E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '';

WITH ranked_items AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "groupId", "type", lower(btrim("value", E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
      ORDER BY
        coalesce("source" = 'USER', true) DESC,
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
SET "value" = lower(btrim("value", E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
WHERE "value" <> lower(btrim("value", E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'));
