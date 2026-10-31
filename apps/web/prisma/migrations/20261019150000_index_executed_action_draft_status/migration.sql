CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExecutedAction_draftStatus_createdAt_draft_idx"
ON "ExecutedAction"("draftStatus", "createdAt") WHERE ("draftId" IS NOT NULL);
