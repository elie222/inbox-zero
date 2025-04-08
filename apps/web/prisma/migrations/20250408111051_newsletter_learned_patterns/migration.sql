-- AlterTable
ALTER TABLE "Newsletter" ADD COLUMN     "lastAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "patternAnalyzed" BOOLEAN NOT NULL DEFAULT false;
