-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Action_ruleId_idx" ON "Action"("ruleId");

-- CreateIndex
CREATE INDEX "CleanupJob_emailAccountId_idx" ON "CleanupJob"("emailAccountId");

-- CreateIndex
CREATE INDEX "CleanupThread_jobId_idx" ON "CleanupThread"("jobId");

-- CreateIndex
CREATE INDEX "DigestItem_actionId_idx" ON "DigestItem"("actionId");

-- CreateIndex
CREATE INDEX "DigestItem_coldEmailId_idx" ON "DigestItem"("coldEmailId");

-- CreateIndex
CREATE INDEX "EmailAccount_userId_idx" ON "EmailAccount"("userId");

-- CreateIndex
CREATE INDEX "EmailToken_emailAccountId_idx" ON "EmailToken"("emailAccountId");

-- CreateIndex
CREATE INDEX "ExecutedAction_executedRuleId_idx" ON "ExecutedAction"("executedRuleId");

-- CreateIndex
CREATE INDEX "Newsletter_categoryId_idx" ON "Newsletter"("categoryId");

-- CreateIndex
CREATE INDEX "Payment_premiumId_idx" ON "Payment"("premiumId");

-- CreateIndex
CREATE INDEX "ScheduledAction_executedRuleId_idx" ON "ScheduledAction"("executedRuleId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_activeOrganizationId_idx" ON "Session"("activeOrganizationId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX "ssoProvider_emailAccountId_idx" ON "ssoProvider"("emailAccountId");

-- CreateIndex
CREATE INDEX "ssoProvider_organizationId_idx" ON "ssoProvider"("organizationId");
