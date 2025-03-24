-- AlterTable
ALTER TABLE "CleanupJob" DROP COLUMN "skipConversations",
ADD COLUMN     "skipConversation" BOOLEAN;
