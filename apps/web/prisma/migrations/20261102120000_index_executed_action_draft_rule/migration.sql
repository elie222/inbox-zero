CREATE INDEX CONCURRENTLY "ExecutedAction_executedRuleId_draft_idx"
ON "ExecutedAction"("executedRuleId") WHERE ("draftId" IS NOT NULL);
