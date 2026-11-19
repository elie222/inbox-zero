CREATE INDEX CONCURRENTLY "ThreadTracker_followUpDraft_cleanup_idx"
ON "ThreadTracker"("emailAccountId", "followUpDraftCreatedAt") WHERE ("followUpDraftContent" IS NOT NULL);
