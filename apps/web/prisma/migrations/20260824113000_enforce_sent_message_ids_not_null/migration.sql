ALTER TABLE "ExecutedAction"
ALTER COLUMN "sentMessageIds" SET NOT NULL;

ALTER TABLE "ExecutedAction"
DROP CONSTRAINT "ExecutedAction_sentMessageIds_not_null";
