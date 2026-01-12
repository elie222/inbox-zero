-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "followUpAwaitingReplyDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "followUpNeedsReplyDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "followUpRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ThreadTracker" ADD COLUMN "followUpAppliedAt" TIMESTAMP(3);
