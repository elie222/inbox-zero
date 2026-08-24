ALTER TABLE "ExecutedAction"
ADD CONSTRAINT "ExecutedAction_sentMessageIds_not_null"
CHECK ("sentMessageIds" IS NOT NULL) NOT VALID;
