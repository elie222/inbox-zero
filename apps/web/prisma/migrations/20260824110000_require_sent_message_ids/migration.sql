UPDATE "ExecutedAction"
SET "sentMessageIds" = ARRAY[]::TEXT[]
WHERE "sentMessageIds" IS NULL;
