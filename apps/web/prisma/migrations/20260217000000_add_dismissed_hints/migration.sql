-- AlterTable
ALTER TABLE "User" ADD COLUMN "dismissedHints" TEXT[] DEFAULT ARRAY[]::TEXT[];
