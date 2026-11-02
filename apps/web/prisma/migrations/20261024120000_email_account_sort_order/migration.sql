-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "sortOrder" INTEGER;

-- Backfill so existing switchers keep their current (creation) order
UPDATE "EmailAccount" account
SET "sortOrder" = ranked.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") - 1 AS position
  FROM "EmailAccount"
) ranked
WHERE account."id" = ranked."id";
