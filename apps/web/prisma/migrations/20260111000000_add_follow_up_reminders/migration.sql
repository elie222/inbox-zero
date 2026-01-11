-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "followUpAwaitingReplyDays" INTEGER,
ADD COLUMN "followUpNeedsReplyDays" INTEGER,
ADD COLUMN "followUpAutoDraftEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ThreadTracker" ADD COLUMN "followUpAppliedAt" TIMESTAMP(3);
