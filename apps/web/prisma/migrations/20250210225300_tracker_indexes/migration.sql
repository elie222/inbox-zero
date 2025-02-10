-- CreateIndex
CREATE INDEX "ThreadTracker_userId_resolved_sentAt_type_idx" ON "ThreadTracker"("userId", "resolved", "sentAt", "type");

-- CreateIndex
CREATE INDEX "ThreadTracker_userId_type_resolved_sentAt_idx" ON "ThreadTracker"("userId", "type", "resolved", "sentAt");
