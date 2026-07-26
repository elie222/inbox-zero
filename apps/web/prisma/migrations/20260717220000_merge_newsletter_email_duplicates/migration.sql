BEGIN;

LOCK TABLE "Newsletter" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "NewsletterEmailMerge" ON COMMIT DROP AS
SELECT
  (ARRAY_AGG(
    "id"
    ORDER BY ("email" = LOWER("email")) DESC, "updatedAt" DESC, "id" DESC
  ))[1] AS "keeperId",
  "emailAccountId",
  LOWER("email") AS "email",
  (ARRAY_AGG("name" ORDER BY "updatedAt" DESC, "id" DESC)
    FILTER (WHERE "name" IS NOT NULL))[1] AS "name",
  (ARRAY_AGG("status" ORDER BY "updatedAt" DESC, "id" DESC)
    FILTER (WHERE "status" IS NOT NULL))[1] AS "status",
  BOOL_OR("patternAnalyzed") AS "patternAnalyzed",
  MAX("lastAnalyzedAt") AS "lastAnalyzedAt",
  (ARRAY_AGG("categoryId" ORDER BY "updatedAt" DESC, "id" DESC)
    FILTER (WHERE "categoryId" IS NOT NULL))[1] AS "categoryId",
  MIN("createdAt") AS "createdAt",
  MAX("updatedAt") AS "updatedAt"
FROM "Newsletter"
GROUP BY "emailAccountId", LOWER("email")
HAVING COUNT(*) > 1;

DELETE FROM "Newsletter" AS newsletter
USING "NewsletterEmailMerge" AS merged
WHERE newsletter."emailAccountId" = merged."emailAccountId"
  AND LOWER(newsletter."email") = merged."email"
  AND newsletter."id" <> merged."keeperId";

UPDATE "Newsletter" AS newsletter
SET
  "email" = merged."email",
  "name" = merged."name",
  "status" = merged."status",
  "patternAnalyzed" = merged."patternAnalyzed",
  "lastAnalyzedAt" = merged."lastAnalyzedAt",
  "categoryId" = merged."categoryId",
  "createdAt" = merged."createdAt",
  "updatedAt" = merged."updatedAt"
FROM "NewsletterEmailMerge" AS merged
WHERE newsletter."id" = merged."keeperId";

CREATE UNIQUE INDEX "Newsletter_emailAccountId_lower_email_key"
ON "Newsletter" ("emailAccountId", LOWER("email"));

DROP INDEX "Newsletter_emailAccountId_lower_email_idx";

COMMIT;
