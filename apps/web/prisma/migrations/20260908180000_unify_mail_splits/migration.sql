DROP INDEX "MailSplit_emailAccountId_order_key";
CREATE INDEX "MailSplit_emailAccountId_order_idx" ON "MailSplit"("emailAccountId", "order");

UPDATE "MailSplit" SET "order" = "order" + 2;

INSERT INTO "MailSplit" ("id", "createdAt", "updatedAt", "name", "kind", "values", "order", "emailAccountId")
SELECT
  gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  available_name."name", defaults."kind"::"MailSplitKind", ARRAY[]::TEXT[],
  defaults."order", account."id"
FROM "EmailAccount" account
CROSS JOIN (VALUES ('all', 'All', 'INBOX', 0), ('unread', 'Unread', 'UNREAD', 1))
  AS defaults("key", "name", "kind", "order")
CROSS JOIN LATERAL (
  SELECT CASE WHEN suffix = 1 THEN defaults."name"
    ELSE defaults."name" || ' (' || suffix || ')' END AS "name"
  FROM generate_series(1, (SELECT COUNT(*)::integer + 1 FROM "MailSplit" WHERE "emailAccountId" = account."id")) suffix
  WHERE NOT EXISTS (
    SELECT 1 FROM "MailSplit" existing
    WHERE existing."emailAccountId" = account."id"
      AND existing."name" = CASE WHEN suffix = 1 THEN defaults."name"
        ELSE defaults."name" || ' (' || suffix || ')' END
  )
  ORDER BY suffix LIMIT 1
) available_name
WHERE NOT (defaults."key" = ANY(account."mailHiddenBuiltInSplits"))
  AND NOT EXISTS (
    SELECT 1 FROM "MailSplit" existing
    WHERE existing."emailAccountId" = account."id"
      AND existing."kind" = defaults."kind"::"MailSplitKind"
  );

ALTER TABLE "EmailAccount" DROP COLUMN "mailHiddenBuiltInSplits";
