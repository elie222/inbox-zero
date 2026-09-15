BEGIN;

-- Keep cleanup and index creation atomic, excluding writers and digest claims.
-- Writers acquire these tables in different orders. NOWAIT and the exception
-- subtransaction release partial locks before retrying, avoiding lock cycles.
DO $$
BEGIN
    FOR attempt IN 1..300 LOOP
        BEGIN
            LOCK TABLE "Digest", "DigestItem" IN ACCESS EXCLUSIVE MODE NOWAIT;
            RETURN;
        EXCEPTION WHEN lock_not_available THEN
            IF attempt = 300 THEN
                RAISE;
            END IF;
        END;
        PERFORM pg_sleep(0.1);
    END LOOP;
END $$;

-- Keep the oldest digest and its existing item content/action metadata. For
-- messages absent from it, keep the oldest duplicate item (id breaks ties).
WITH duplicate_pending_digest AS (
    SELECT
        "id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "emailAccountId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "keeperId",
        ROW_NUMBER() OVER (
            PARTITION BY "emailAccountId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "rowNumber"
    FROM "Digest"
    WHERE "status" = 'PENDING'
),
movable_duplicate_item AS (
    SELECT
        item."id",
        duplicate_pending_digest."keeperId",
        ROW_NUMBER() OVER (
            PARTITION BY duplicate_pending_digest."keeperId", item."threadId", item."messageId"
            ORDER BY item."createdAt" ASC, item."id" ASC
        ) AS "itemRowNumber"
    FROM "DigestItem" AS item
    JOIN duplicate_pending_digest ON item."digestId" = duplicate_pending_digest."id"
    WHERE duplicate_pending_digest."rowNumber" > 1
      AND NOT EXISTS (
          SELECT 1
          FROM "DigestItem" AS existing_item
          WHERE existing_item."digestId" = duplicate_pending_digest."keeperId"
            AND existing_item."threadId" = item."threadId"
            AND existing_item."messageId" = item."messageId"
      )
)
UPDATE "DigestItem" AS item
SET "digestId" = movable_duplicate_item."keeperId"
FROM movable_duplicate_item
WHERE item."id" = movable_duplicate_item."id"
  AND movable_duplicate_item."itemRowNumber" = 1;

WITH duplicate_pending_digest AS (
    SELECT
        "id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "emailAccountId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "keeperId",
        ROW_NUMBER() OVER (
            PARTITION BY "emailAccountId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "rowNumber"
    FROM "Digest"
    WHERE "status" = 'PENDING'
)
DELETE FROM "DigestItem" AS item
USING duplicate_pending_digest
WHERE item."digestId" = duplicate_pending_digest."id"
  AND duplicate_pending_digest."rowNumber" > 1;

WITH duplicate_pending_digest AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "emailAccountId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "rowNumber"
    FROM "Digest"
    WHERE "status" = 'PENDING'
)
DELETE FROM "Digest" AS digest
USING duplicate_pending_digest
WHERE digest."id" = duplicate_pending_digest."id"
  AND duplicate_pending_digest."rowNumber" > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Digest_emailAccountId_pending_key" ON "Digest"("emailAccountId") WHERE "status" = 'PENDING';

COMMIT;
