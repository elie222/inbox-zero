/*
  Warnings:

  - You are about to drop the column `aiApiKey` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `aiModel` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `aiProvider` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `webhookSecret` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `about` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `autoCategorizeSenders` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `behaviorProfile` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `coldEmailBlocker` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `coldEmailPrompt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastSummaryEmailAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncedHistoryId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `outboundReplyTracking` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `rulesPrompt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `signature` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `statsEmailFrequency` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `summaryEmailFrequency` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `watchEmailsExpirationDate` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_lastSummaryEmailAt_idx";

-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN "aiApiKey",
DROP COLUMN "aiModel",
DROP COLUMN "aiProvider",
DROP COLUMN "webhookSecret";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "about",
DROP COLUMN "autoCategorizeSenders",
DROP COLUMN "behaviorProfile",
DROP COLUMN "coldEmailBlocker",
DROP COLUMN "coldEmailPrompt",
DROP COLUMN "lastSummaryEmailAt",
DROP COLUMN "lastSyncedHistoryId",
DROP COLUMN "outboundReplyTracking",
DROP COLUMN "rulesPrompt",
DROP COLUMN "signature",
DROP COLUMN "statsEmailFrequency",
DROP COLUMN "summaryEmailFrequency",
DROP COLUMN "watchEmailsExpirationDate";
