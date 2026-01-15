-- CreateIndex
CREATE INDEX "ThreadTracker_emailAccountId_type_resolved_followUpAppliedA_idx" ON "ThreadTracker"("emailAccountId", "type", "resolved", "followUpAppliedAt", "sentAt");
