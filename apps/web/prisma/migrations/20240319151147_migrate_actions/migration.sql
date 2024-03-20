-- Migrate data from ExecutedRule to ExecutedAction
INSERT INTO "ExecutedAction" ("id", "createdAt", "updatedAt", "type", "executedRuleId", "label", "subject", "content", "to", "cc", "bcc")
SELECT
  gen_random_uuid(),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  unnest("actions"),
  "ExecutedRule"."id",
  "data"->>'label',
  "data"->>'subject',
  "data"->>'content',
  "data"->>'to',
  "data"->>'cc',
  "data"->>'bcc'
FROM "ExecutedRule";