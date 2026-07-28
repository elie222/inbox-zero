DELETE FROM "GroupItem"
WHERE btrim("value") = '';

WITH ranked_items AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "groupId", "type", lower(btrim("value"))
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
SET "value" = lower(btrim("value"))
WHERE "value" <> lower(btrim("value"));
