-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSummaryEmailAt" TIMESTAMP(3),
ADD COLUMN     "summaryEmailFrequency" "Frequency" NOT NULL DEFAULT 'WEEKLY';
