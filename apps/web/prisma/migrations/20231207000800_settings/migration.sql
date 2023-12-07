-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('NEVER', 'WEEKLY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "categorizeEmails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "statsEmailFrequency" "Frequency" NOT NULL DEFAULT 'WEEKLY';
