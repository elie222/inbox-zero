-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "labelId" TEXT;

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "awaitingReplyLabelId" TEXT,
ADD COLUMN     "coldEmailLabelId" TEXT,
ADD COLUMN     "needsReplyLabelId" TEXT;

-- AlterTable
ALTER TABLE "ExecutedAction" ADD COLUMN     "labelId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledAction" ADD COLUMN     "labelId" TEXT;
