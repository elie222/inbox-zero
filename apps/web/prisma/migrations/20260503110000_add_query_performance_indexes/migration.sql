-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAccount_watchEmailsSubscriptionId_idx" ON "EmailAccount"("watchEmailsSubscriptionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAccount_watchEmailsSubscriptionHistory_idx" ON "EmailAccount" USING GIN ("watchEmailsSubscriptionHistory" jsonb_path_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Rule_emailAccountId_enabled_idx" ON "Rule"("emailAccountId", "enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutedRule_ruleId_idx" ON "ExecutedRule"("ruleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutedRule_emailAccountId_id_idx" ON "ExecutedRule"("emailAccountId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutedAction_messagingChannelId_createdAt_idx" ON "ExecutedAction"("messagingChannelId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Group_emailAccountId_idx" ON "Group"("emailAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Label_emailAccountId_idx" ON "Label"("emailAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_emailAccountId_idx" ON "Category"("emailAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CleanupThread_emailAccountId_idx" ON "CleanupThread"("emailAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DraftSendLog_replyMemorySentText_createdAt_idx" ON "DraftSendLog"("createdAt") WHERE "replyMemorySentText" IS NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Newsletter_patternAnalyzed_emailAccountId_lowerEmail_idx" ON "Newsletter"("emailAccountId", lower("email")) WHERE "patternAnalyzed" = true;
