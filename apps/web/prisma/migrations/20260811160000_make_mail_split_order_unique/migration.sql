-- Preserve the existing order while repairing any duplicates created by
-- concurrent requests before the application-level lock was added.
BEGIN;

LOCK TABLE "MailSplit" IN ACCESS EXCLUSIVE MODE;

WITH "rankedSplits" AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (
      PARTITION BY "emailAccountId"
      ORDER BY "order", "createdAt", "id"
    ) - 1)::integer AS "normalizedOrder"
  FROM "MailSplit"
)
UPDATE "MailSplit"
SET "order" = "rankedSplits"."normalizedOrder"
FROM "rankedSplits"
WHERE "MailSplit"."id" = "rankedSplits"."id";

DROP INDEX "MailSplit_emailAccountId_order_idx";

CREATE UNIQUE INDEX "MailSplit_emailAccountId_order_key"
ON "MailSplit"("emailAccountId", "order");

COMMIT;
