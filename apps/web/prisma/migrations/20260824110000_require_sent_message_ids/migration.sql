UPDATE "ExecutedAction"
SET "sentMessageIds" = ARRAY[]::TEXT[]
WHERE "sentMessageIds" IS NULL;

ALTER TABLE "ExecutedAction"
ALTER COLUMN "sentMessageIds" SET NOT NULL;
