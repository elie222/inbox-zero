-- DropIndex
DROP INDEX "ExecutedRule_emailAccountId_threadId_messageId_key";

-- CreateIndex
CREATE INDEX "ExecutedRule_emailAccountId_threadId_messageId_ruleId_idx" ON "ExecutedRule"("emailAccountId", "threadId", "messageId", "ruleId");

-- CreateIndex
CREATE INDEX "ExecutedRule_emailAccountId_messageId_idx" ON "ExecutedRule"("emailAccountId", "messageId");
