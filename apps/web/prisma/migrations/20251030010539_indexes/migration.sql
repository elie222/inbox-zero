-- CreateIndex - Production safe with CONCURRENTLY (no table locks) and IF NOT EXISTS (idempotent)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Action_ruleId_idx" ON "Action"("ruleId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CleanupJob_emailAccountId_idx" ON "CleanupJob"("emailAccountId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CleanupThread_jobId_idx" ON "CleanupThread"("jobId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DigestItem_actionId_idx" ON "DigestItem"("actionId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DigestItem_coldEmailId_idx" ON "DigestItem"("coldEmailId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "EmailAccount_userId_idx" ON "EmailAccount"("userId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "EmailToken_emailAccountId_idx" ON "EmailToken"("emailAccountId");

-- CreateIndex - CRITICAL: 2.3M rows, this will take 5-10 minutes but won't lock the table
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExecutedAction_executedRuleId_idx" ON "ExecutedAction"("executedRuleId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Newsletter_categoryId_idx" ON "Newsletter"("categoryId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_premiumId_idx" ON "Payment"("premiumId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ScheduledAction_executedRuleId_idx" ON "ScheduledAction"("executedRuleId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_activeOrganizationId_idx" ON "Session"("activeOrganizationId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ssoProvider_emailAccountId_idx" ON "ssoProvider"("emailAccountId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ssoProvider_organizationId_idx" ON "ssoProvider"("organizationId");
