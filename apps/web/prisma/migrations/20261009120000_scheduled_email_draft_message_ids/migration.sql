-- AlterTable
ALTER TABLE "ScheduledEmail" ADD COLUMN     "draftMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
