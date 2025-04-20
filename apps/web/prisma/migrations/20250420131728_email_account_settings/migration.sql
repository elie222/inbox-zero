/*
  Warnings:

  - You are about to drop the column `emailAccountId` on the `Account` table. All the data in the column will be lost.
  - The primary key for the `EmailAccount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `EmailAccount` table. All the data in the column will be lost.
  - Added the required column `email` to the `CleanupJob` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_emailAccountId_fkey";

-- DropIndex
DROP INDEX "Account_emailAccountId_key";

-- DropIndex
DROP INDEX "EmailAccount_email_key";

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "emailAccountId";

-- AlterTable
-- Step 1: Add the email column, allowing NULLs for now
ALTER TABLE "CleanupJob" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "EmailAccount" DROP CONSTRAINT "EmailAccount_pkey",
DROP COLUMN "id",
ADD COLUMN     "about" TEXT,
ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiProvider" TEXT,
ADD COLUMN     "autoCategorizeSenders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "behaviorProfile" JSONB,
ADD COLUMN     "coldEmailBlocker" "ColdEmailSetting",
ADD COLUMN     "coldEmailPrompt" TEXT,
ADD COLUMN     "lastSummaryEmailAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncedHistoryId" TEXT,
ADD COLUMN     "outboundReplyTracking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rulesPrompt" TEXT,
ADD COLUMN     "signature" TEXT,
ADD COLUMN     "statsEmailFrequency" "Frequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "summaryEmailFrequency" "Frequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "watchEmailsExpirationDate" TIMESTAMP(3),
ADD COLUMN     "webhookSecret" TEXT,
ADD CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("email");

-- CreateIndex
CREATE INDEX "EmailAccount_lastSummaryEmailAt_idx" ON "EmailAccount"("lastSummaryEmailAt");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: Ensure every User with an Account has a corresponding EmailAccount
-- and populate it with settings from the User model.

-- Step 1: Create EmailAccount entries for existing Users linked to an Account
INSERT INTO "EmailAccount" (
    "email", "userId", "accountId",
    "about", "signature", "watchEmailsExpirationDate",
    "lastSyncedHistoryId", "behaviorProfile", "aiProvider", "aiModel", "aiApiKey",
    "statsEmailFrequency", "summaryEmailFrequency", "lastSummaryEmailAt", "coldEmailBlocker",
    "coldEmailPrompt", "rulesPrompt", "webhookSecret", "outboundReplyTracking", "autoCategorizeSenders",
    "createdAt", "updatedAt"
)
SELECT
    u.email,
    u.id AS userId,
    a.id AS accountId,
    u.about,
    u.signature,
    u."watchEmailsExpirationDate",
    u."lastSyncedHistoryId",
    u."behaviorProfile",
    u."aiProvider",
    u."aiModel",
    u."aiApiKey",
    u."statsEmailFrequency",
    u."summaryEmailFrequency",
    u."lastSummaryEmailAt",
    u."coldEmailBlocker",
    u."coldEmailPrompt",
    u."rulesPrompt",
    u."webhookSecret",
    u."outboundReplyTracking",
    u."autoCategorizeSenders",
    NOW(), -- Set creation timestamp
    NOW()  -- Set updated timestamp
FROM "User" u
JOIN "Account" a ON u.id = a."userId" -- Join ensures we only process users with accounts
WHERE u.email IS NOT NULL AND u.email <> '' -- Ensure the user has a valid email
ON CONFLICT ("email") DO UPDATE SET
    -- If an EmailAccount with this email already exists, update its fields
    -- This handles cases where the migration might be run multiple times or if some data exists partially
    "userId" = EXCLUDED."userId",
    "accountId" = EXCLUDED."accountId",
    "about" = COALESCE(EXCLUDED.about, "EmailAccount".about),
    "signature" = COALESCE(EXCLUDED.signature, "EmailAccount".signature),
    "watchEmailsExpirationDate" = COALESCE(EXCLUDED."watchEmailsExpirationDate", "EmailAccount"."watchEmailsExpirationDate"),
    "lastSyncedHistoryId" = COALESCE(EXCLUDED."lastSyncedHistoryId", "EmailAccount"."lastSyncedHistoryId"),
    "behaviorProfile" = COALESCE(EXCLUDED."behaviorProfile", "EmailAccount"."behaviorProfile"),
    "aiProvider" = COALESCE(EXCLUDED."aiProvider", "EmailAccount"."aiProvider"),
    "aiModel" = COALESCE(EXCLUDED."aiModel", "EmailAccount"."aiModel"),
    "aiApiKey" = COALESCE(EXCLUDED."aiApiKey", "EmailAccount"."aiApiKey"),
    "statsEmailFrequency" = EXCLUDED."statsEmailFrequency", -- Non-nullable fields can be directly updated
    "summaryEmailFrequency" = EXCLUDED."summaryEmailFrequency",
    "lastSummaryEmailAt" = COALESCE(EXCLUDED."lastSummaryEmailAt", "EmailAccount"."lastSummaryEmailAt"),
    "coldEmailBlocker" = EXCLUDED."coldEmailBlocker", -- Enum can be updated directly (nullable)
    "coldEmailPrompt" = COALESCE(EXCLUDED."coldEmailPrompt", "EmailAccount"."coldEmailPrompt"),
    "rulesPrompt" = COALESCE(EXCLUDED."rulesPrompt", "EmailAccount"."rulesPrompt"),
    "webhookSecret" = COALESCE(EXCLUDED."webhookSecret", "EmailAccount"."webhookSecret"),
    "outboundReplyTracking" = EXCLUDED."outboundReplyTracking", -- Non-nullable boolean
    "autoCategorizeSenders" = EXCLUDED."autoCategorizeSenders", -- Non-nullable boolean
    "updatedAt" = NOW(); -- Update the timestamp

-- Step 2: Update the CleanupJob table to link to EmailAccount via email
UPDATE "CleanupJob" cj
SET email = u.email
FROM "User" u
WHERE cj."userId" = u.id AND u.email IS NOT NULL AND u.email <> '';

-- Step 3: Now that all rows have a non-null email, enforce the NOT NULL constraint
ALTER TABLE "CleanupJob" ALTER COLUMN "email" SET NOT NULL;

-- Step 4: Add the foreign key constraint (moved from earlier)
ALTER TABLE "CleanupJob" ADD CONSTRAINT "CleanupJob_email_fkey" FOREIGN KEY ("email") REFERENCES "EmailAccount"("email") ON DELETE CASCADE ON UPDATE CASCADE;
