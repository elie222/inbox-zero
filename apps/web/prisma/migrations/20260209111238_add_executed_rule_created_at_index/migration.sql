-- CreateIndex
CREATE INDEX "ExecutedRule_emailAccountId_createdAt_idx" ON "ExecutedRule"("emailAccountId", "createdAt");

-- RenameIndex
ALTER INDEX "ThreadTracker_emailAccountId_type_resolved_followUpAppliedAt_id" RENAME TO "ThreadTracker_emailAccountId_type_resolved_followUpAppliedA_idx";
