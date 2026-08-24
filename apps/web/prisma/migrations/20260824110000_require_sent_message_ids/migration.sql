UPDATE "ExecutedAction"
SET "sentMessageIds" = ARRAY[]::TEXT[]
WHERE "sentMessageIds" IS NULL;

ALTER TABLE "ExecutedAction"
ADD CONSTRAINT "ExecutedAction_sentMessageIds_not_null"
CHECK ("sentMessageIds" IS NOT NULL) NOT VALID;

ALTER TABLE "ExecutedAction"
VALIDATE CONSTRAINT "ExecutedAction_sentMessageIds_not_null";

ALTER TABLE "ExecutedAction"
ALTER COLUMN "sentMessageIds" SET NOT NULL;

ALTER TABLE "ExecutedAction"
DROP CONSTRAINT "ExecutedAction_sentMessageIds_not_null";
