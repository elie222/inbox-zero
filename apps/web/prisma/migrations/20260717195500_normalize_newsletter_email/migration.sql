CREATE TEMP TABLE "_NewsletterCanonical" AS
SELECT
    (array_agg("id" ORDER BY ("status" IS NOT NULL) DESC, "updatedAt" DESC, "id"))[1] AS "survivorId",
    count(*) AS "variantCount",
    "emailAccountId",
    lower("email") AS "email",
    min("createdAt") AS "createdAt",
    max("updatedAt") AS "updatedAt",
    (array_agg("name" ORDER BY "updatedAt" DESC, "id") FILTER (WHERE "name" IS NOT NULL))[1] AS "name",
    (array_agg("status" ORDER BY "updatedAt" DESC, "id") FILTER (WHERE "status" IS NOT NULL))[1] AS "status",
    bool_or("patternAnalyzed") AS "patternAnalyzed",
    max("lastAnalyzedAt") AS "lastAnalyzedAt",
    (array_agg("categoryId" ORDER BY "updatedAt" DESC, "id") FILTER (WHERE "categoryId" IS NOT NULL))[1] AS "categoryId"
FROM "Newsletter"
GROUP BY "emailAccountId", lower("email");

DELETE FROM "Newsletter" AS newsletter
USING "_NewsletterCanonical" AS canonical
WHERE newsletter."emailAccountId" = canonical."emailAccountId"
  AND lower(newsletter."email") = canonical."email"
  AND newsletter."id" <> canonical."survivorId";

UPDATE "Newsletter" AS newsletter
SET
    "email" = canonical."email",
    "createdAt" = canonical."createdAt",
    "updatedAt" = canonical."updatedAt",
    "name" = canonical."name",
    "status" = canonical."status",
    "patternAnalyzed" = canonical."patternAnalyzed",
    "lastAnalyzedAt" = canonical."lastAnalyzedAt",
    "categoryId" = canonical."categoryId"
FROM "_NewsletterCanonical" AS canonical
WHERE newsletter."id" = canonical."survivorId"
  AND (
    newsletter."email" <> canonical."email"
    OR canonical."variantCount" > 1
  );

DROP TABLE "_NewsletterCanonical";

ALTER TABLE "Newsletter"
ADD CONSTRAINT "Newsletter_email_lowercase_check"
CHECK ("email" = lower("email"));
