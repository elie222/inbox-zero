-- AlterTable
ALTER TABLE "ScheduledEmail" ADD COLUMN     "draftMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
