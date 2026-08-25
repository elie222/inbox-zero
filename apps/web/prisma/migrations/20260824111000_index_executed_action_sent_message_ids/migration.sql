CREATE INDEX CONCURRENTLY "ExecutedAction_sentMessageIds_idx"
ON "ExecutedAction" USING GIN ("sentMessageIds");
