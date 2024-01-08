-- CreateEnum
CREATE TYPE "ColdEmailStatus" AS ENUM ('COLD_EMAIL');

-- CreateEnum
CREATE TYPE "ColdEmailSetting" AS ENUM ('DISABLED', 'LIST', 'LABEL', 'ARCHIVE_AND_LABEL');

-- AlterTable
ALTER TABLE "Newsletter" ADD COLUMN     "coldEmail" "ColdEmailStatus";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coldEmailBlocker" "ColdEmailSetting",
ADD COLUMN     "coldEmailPrompt" TEXT;
