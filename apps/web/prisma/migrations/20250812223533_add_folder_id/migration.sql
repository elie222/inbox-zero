-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "ExecutedAction" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledAction" ADD COLUMN     "folderId" TEXT;
