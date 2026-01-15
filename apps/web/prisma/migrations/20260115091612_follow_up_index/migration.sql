-- CreateIndex
CREATE INDEX IF NOT EXISTS "ThreadTracker_emailAccountId_type_resolved_followUpAppliedAt_idx" ON "ThreadTracker"("emailAccountId", "type", "resolved", "followUpAppliedAt", "sentAt");
