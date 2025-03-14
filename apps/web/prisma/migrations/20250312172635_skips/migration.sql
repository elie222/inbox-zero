-- AlterTable
ALTER TABLE "CleanupJob" ADD COLUMN     "skipAttachment" BOOLEAN,
ADD COLUMN     "skipCalendar" BOOLEAN,
ADD COLUMN     "skipReceipt" BOOLEAN,
ADD COLUMN     "skipReply" BOOLEAN,
ADD COLUMN     "skipStarred" BOOLEAN;
