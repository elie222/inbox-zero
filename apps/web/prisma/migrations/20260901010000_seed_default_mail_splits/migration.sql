BEGIN;

CREATE TEMP TABLE "DefaultMailSplitAccount" ON COMMIT DROP AS
SELECT DISTINCT r."emailAccountId"
FROM "Rule" AS r
INNER JOIN "Action" AS a
  ON a."ruleId" = r."id"
  AND a."emailAccountId" = r."emailAccountId"
WHERE r."systemType" IN (
  'TO_REPLY',
  'NEWSLETTER',
  'MARKETING',
  'CALENDAR',
  'RECEIPT',
  'NOTIFICATION',
  'COLD_EMAIL'
)
  AND r."enabled" = true
  AND a."type" = 'LABEL'
  AND a."labelId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Action" AS moves_out_of_inbox
    WHERE moves_out_of_inbox."ruleId" = r."id"
      AND moves_out_of_inbox."emailAccountId" = r."emailAccountId"
      AND moves_out_of_inbox."type" IN ('ARCHIVE', 'MOVE_FOLDER')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "MailSplit" AS existing
    WHERE existing."emailAccountId" = r."emailAccountId"
  );

-- Serialize the backfill with live split creation for each eligible account.
DO $$
DECLARE
  account RECORD;
BEGIN
  FOR account IN
    SELECT "emailAccountId"
    FROM "DefaultMailSplitAccount"
    ORDER BY "emailAccountId"
  LOOP
    PERFORM pg_advisory_xact_lock(742931, hashtext(account."emailAccountId"));
  END LOOP;
END $$;

WITH "standardRuleLabels" AS (
  SELECT DISTINCT ON (r."emailAccountId", r."systemType")
    r."id" AS "ruleId",
    r."emailAccountId",
    r."systemType",
    COALESCE(a."label", r."name") AS "name",
    a."labelId" AS "value",
    CASE r."systemType"
      WHEN 'TO_REPLY' THEN 0
      WHEN 'NEWSLETTER' THEN 1
      WHEN 'MARKETING' THEN 2
      WHEN 'CALENDAR' THEN 3
      WHEN 'RECEIPT' THEN 4
      WHEN 'NOTIFICATION' THEN 5
      WHEN 'COLD_EMAIL' THEN 6
    END AS "standardOrder"
  FROM "Rule" AS r
  INNER JOIN "DefaultMailSplitAccount" AS target
    ON target."emailAccountId" = r."emailAccountId"
  INNER JOIN "Action" AS a
    ON a."ruleId" = r."id"
    AND a."emailAccountId" = r."emailAccountId"
  WHERE r."systemType" IN (
    'TO_REPLY',
    'NEWSLETTER',
    'MARKETING',
    'CALENDAR',
    'RECEIPT',
    'NOTIFICATION',
    'COLD_EMAIL'
  )
    AND r."enabled" = true
    AND a."type" = 'LABEL'
    AND a."labelId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "Action" AS moves_out_of_inbox
      WHERE moves_out_of_inbox."ruleId" = r."id"
        AND moves_out_of_inbox."emailAccountId" = r."emailAccountId"
        AND moves_out_of_inbox."type" IN ('ARCHIVE', 'MOVE_FOLDER')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "MailSplit" AS existing
      WHERE existing."emailAccountId" = r."emailAccountId"
    )
  ORDER BY r."emailAccountId", r."systemType", a."createdAt"
),
"rankedSplits" AS (
  SELECT
    *,
    (ROW_NUMBER() OVER (
      PARTITION BY "emailAccountId"
      ORDER BY "standardOrder"
    ) - 1)::integer AS "splitOrder"
  FROM "standardRuleLabels"
)
INSERT INTO "MailSplit" (
  "id",
  "createdAt",
  "updatedAt",
  "name",
  "kind",
  "value",
  "order",
  "emailAccountId"
)
SELECT
  CONCAT('default-split-', "ruleId"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "name",
  'LABEL'::"MailSplitKind",
  "value",
  "splitOrder",
  "emailAccountId"
FROM "rankedSplits"
ON CONFLICT DO NOTHING;

COMMIT;
