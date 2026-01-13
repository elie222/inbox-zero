-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "bulkArchiveAction" "CleanAction" NOT NULL DEFAULT 'ARCHIVE';

-- CreateIndex
CREATE INDEX "ThreadTracker_emailAccountId_type_resolved_followUpAppliedA_idx" ON "ThreadTracker"("emailAccountId", "type", "resolved", "followUpAppliedAt", "sentAt");
