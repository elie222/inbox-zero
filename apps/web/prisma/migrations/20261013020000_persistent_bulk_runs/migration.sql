CREATE TABLE "BulkRuleRun" (
 "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "emailAccountId" TEXT NOT NULL, "activeAccountId" TEXT, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3), "includeRead" BOOLEAN NOT NULL, "rerun" BOOLEAN NOT NULL,
 "generateDraftReplies" BOOLEAN NOT NULL, "maxEmails" INTEGER, "nextPageToken" TEXT, "scannedAt" TIMESTAMP(3),
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "error" TEXT,
 CONSTRAINT "BulkRuleRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BulkRuleRunItem" (
 "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "runId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "subject" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "ruleNames" TEXT[], "error" TEXT,
 CONSTRAINT "BulkRuleRunItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BulkRuleRun_activeAccountId_key" ON "BulkRuleRun"("activeAccountId");
CREATE INDEX "BulkRuleRun_emailAccountId_createdAt_idx" ON "BulkRuleRun"("emailAccountId", "createdAt");
CREATE INDEX "BulkRuleRun_status_leaseUntil_idx" ON "BulkRuleRun"("status", "leaseUntil");
CREATE UNIQUE INDEX "BulkRuleRunItem_runId_threadId_key" ON "BulkRuleRunItem"("runId", "threadId");
CREATE INDEX "BulkRuleRunItem_runId_status_createdAt_idx" ON "BulkRuleRunItem"("runId", "status", "createdAt");
ALTER TABLE "BulkRuleRun" ADD CONSTRAINT "BulkRuleRun_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkRuleRunItem" ADD CONSTRAINT "BulkRuleRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BulkRuleRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
