-- CreateIndex
CREATE INDEX "ColdEmail_userId_createdAt_idx" ON "ColdEmail"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutedRule_userId_status_createdAt_idx" ON "ExecutedRule"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "User_lastSummaryEmailAt_idx" ON "User"("lastSummaryEmailAt");
