/*
  Warnings:

  - The primary key for the `EmailAccount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[name,emailAccountId]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,fromEmail]` on the table `ColdEmail` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `EmailAccount` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,threadId,messageId]` on the table `EmailMessage` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,threadId,messageId]` on the table `ExecutedRule` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name,emailAccountId]` on the table `Group` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,title]` on the table `Knowledge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gmailLabelId,emailAccountId]` on the table `Label` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name,emailAccountId]` on the table `Label` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,emailAccountId]` on the table `Newsletter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name,emailAccountId]` on the table `Rule` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,systemType]` on the table `Rule` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailAccountId,threadId,messageId]` on the table `ThreadTracker` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `emailAccountId` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `CleanupJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `CleanupThread` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `ColdEmail` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `EmailAccount` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `emailAccountId` to the `EmailMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `EmailToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `ExecutedRule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `Group` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `Label` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `Newsletter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `Rule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emailAccountId` to the `ThreadTracker` table without a default value. This is not possible if the table is not empty.

*/

-- First, add the ID column to EmailAccount and initialize it as nullable
ALTER TABLE "EmailAccount" ADD COLUMN "id" TEXT;

-- Add name and image to EmailAccount
ALTER TABLE "EmailAccount" ADD COLUMN "image" TEXT;
ALTER TABLE "EmailAccount" ADD COLUMN "name" TEXT;

-- ** BEFORE MODIFYING EmailAccount PK, DROP DEPENDENT FOREIGN KEY **
-- DropForeignKey for CleanupJob referencing the OLD EmailAccount PK (email)
ALTER TABLE "CleanupJob" DROP CONSTRAINT "CleanupJob_email_fkey";

-- Update EmailAccount with generated IDs where needed
UPDATE "EmailAccount" SET "id" = gen_random_uuid()::TEXT WHERE "id" IS NULL;

-- Now make the ID column required and the NEW primary key
ALTER TABLE "EmailAccount" DROP CONSTRAINT "EmailAccount_pkey";
ALTER TABLE "EmailAccount" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id");

-- DropForeignKey for EmailAccount referencing Account (unrelated to the error, but keep order logical)
ALTER TABLE "EmailAccount" DROP CONSTRAINT "EmailAccount_accountId_fkey";

-- DropIndex
DROP INDEX "Account_userId_key";

-- DropIndex
DROP INDEX "Category_name_userId_key";

-- DropIndex
DROP INDEX "ColdEmail_userId_createdAt_idx";

-- DropIndex
DROP INDEX "ColdEmail_userId_fromEmail_key";

-- DropIndex
DROP INDEX "ColdEmail_userId_status_idx";

-- DropIndex
DROP INDEX "EmailMessage_userId_date_idx";

-- DropIndex
DROP INDEX "EmailMessage_userId_from_idx";

-- DropIndex
DROP INDEX "EmailMessage_userId_threadId_idx";

-- DropIndex
DROP INDEX "EmailMessage_userId_threadId_messageId_key";

-- DropIndex
DROP INDEX "ExecutedRule_userId_status_createdAt_idx";

-- DropIndex
DROP INDEX "ExecutedRule_userId_threadId_messageId_key";

-- DropIndex
DROP INDEX "Group_name_userId_key";

-- DropIndex
DROP INDEX "Knowledge_userId_title_key";

-- DropIndex
DROP INDEX "Label_gmailLabelId_userId_key";

-- DropIndex
DROP INDEX "Label_name_userId_key";

-- DropIndex
DROP INDEX "Newsletter_email_userId_key";

-- DropIndex
DROP INDEX "Newsletter_userId_status_idx";

-- DropIndex
DROP INDEX "Rule_name_userId_key";

-- DropIndex
DROP INDEX "Rule_userId_systemType_key";

-- DropIndex
DROP INDEX "ThreadTracker_userId_resolved_idx";

-- DropIndex
DROP INDEX "ThreadTracker_userId_resolved_sentAt_type_idx";

-- DropIndex
DROP INDEX "ThreadTracker_userId_threadId_messageId_key";

-- DropIndex
DROP INDEX "ThreadTracker_userId_type_resolved_sentAt_idx";

-- First, add emailAccountId columns to all tables
ALTER TABLE "Category" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "CleanupJob" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "CleanupThread" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "ColdEmail" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "EmailToken" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "ExecutedRule" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "Group" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "Knowledge" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "Label" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "Newsletter" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "Rule" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "ThreadTracker" ADD COLUMN "emailAccountId" TEXT;

-- Add data migration - update all records to associate with the correct EmailAccount
-- For each user, find their EmailAccount and use its ID

-- Update Category
UPDATE "Category" c
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE c."userId" = ea."userId";

-- Update CleanupJob - special handling for email to emailAccountId
UPDATE "CleanupJob" c
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE c."email" = ea."email";

-- Update CleanupThread
UPDATE "CleanupThread" c
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE c."userId" = ea."userId";

-- Update ColdEmail
UPDATE "ColdEmail" c
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE c."userId" = ea."userId";

-- Update EmailMessage
UPDATE "EmailMessage" em
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE em."userId" = ea."userId";

-- Update EmailToken
UPDATE "EmailToken" et
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE et."userId" = ea."userId";

-- Update ExecutedRule
UPDATE "ExecutedRule" er
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE er."userId" = ea."userId";

-- Update Group
UPDATE "Group" g
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE g."userId" = ea."userId";

-- Update Knowledge 
UPDATE "Knowledge" k
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE k."userId" = ea."userId";

-- Update Label
UPDATE "Label" l
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE l."userId" = ea."userId";

-- Update Newsletter
UPDATE "Newsletter" n
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE n."userId" = ea."userId";

-- Update Rule
UPDATE "Rule" r
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE r."userId" = ea."userId";

-- Update ThreadTracker
UPDATE "ThreadTracker" tt
SET "emailAccountId" = ea."id"
FROM "EmailAccount" ea
WHERE tt."userId" = ea."userId";

-- Now make the columns required
ALTER TABLE "Category" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "CleanupJob" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "CleanupThread" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "ColdEmail" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "EmailMessage" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "EmailToken" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "ExecutedRule" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "Group" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "Knowledge" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "Label" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "Newsletter" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "Rule" ALTER COLUMN "emailAccountId" SET NOT NULL;
ALTER TABLE "ThreadTracker" ALTER COLUMN "emailAccountId" SET NOT NULL;

-- AlterTable
-- Now create unique index on EmailAccount.email 
CREATE UNIQUE INDEX "EmailAccount_email_key" ON "EmailAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_emailAccountId_key" ON "Category"("name", "emailAccountId");

-- CreateIndex
CREATE INDEX "ColdEmail_emailAccountId_status_idx" ON "ColdEmail"("emailAccountId", "status");

-- CreateIndex
CREATE INDEX "ColdEmail_emailAccountId_createdAt_idx" ON "ColdEmail"("emailAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ColdEmail_emailAccountId_fromEmail_key" ON "ColdEmail"("emailAccountId", "fromEmail");

-- CreateIndex
CREATE INDEX "EmailMessage_emailAccountId_threadId_idx" ON "EmailMessage"("emailAccountId", "threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_emailAccountId_date_idx" ON "EmailMessage"("emailAccountId", "date");

-- CreateIndex
CREATE INDEX "EmailMessage_emailAccountId_from_idx" ON "EmailMessage"("emailAccountId", "from");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_emailAccountId_threadId_messageId_key" ON "EmailMessage"("emailAccountId", "threadId", "messageId");

-- CreateIndex
CREATE INDEX "ExecutedRule_emailAccountId_status_createdAt_idx" ON "ExecutedRule"("emailAccountId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutedRule_emailAccountId_threadId_messageId_key" ON "ExecutedRule"("emailAccountId", "threadId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_emailAccountId_key" ON "Group"("name", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Knowledge_emailAccountId_title_key" ON "Knowledge"("emailAccountId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Label_gmailLabelId_emailAccountId_key" ON "Label"("gmailLabelId", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_name_emailAccountId_key" ON "Label"("name", "emailAccountId");

-- CreateIndex
CREATE INDEX "Newsletter_emailAccountId_status_idx" ON "Newsletter"("emailAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Newsletter_email_emailAccountId_key" ON "Newsletter"("email", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_name_emailAccountId_key" ON "Rule"("name", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_emailAccountId_systemType_key" ON "Rule"("emailAccountId", "systemType");

-- CreateIndex
CREATE INDEX "ThreadTracker_emailAccountId_resolved_idx" ON "ThreadTracker"("emailAccountId", "resolved");

-- CreateIndex
CREATE INDEX "ThreadTracker_emailAccountId_resolved_sentAt_type_idx" ON "ThreadTracker"("emailAccountId", "resolved", "sentAt", "type");

-- CreateIndex
CREATE INDEX "ThreadTracker_emailAccountId_type_resolved_sentAt_idx" ON "ThreadTracker"("emailAccountId", "type", "resolved", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadTracker_emailAccountId_threadId_messageId_key" ON "ThreadTracker"("emailAccountId", "threadId", "messageId");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutedRule" ADD CONSTRAINT "ExecutedRule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Newsletter" ADD CONSTRAINT "Newsletter_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColdEmail" ADD CONSTRAINT "ColdEmail_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadTracker" ADD CONSTRAINT "ThreadTracker_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanupJob" ADD CONSTRAINT "CleanupJob_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanupThread" ADD CONSTRAINT "CleanupThread_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: Copy AI settings from EmailAccount back to User
-- Strategy: Copy from the first EmailAccount created for each user.
-- This will overwrite any existing values in User.aiProvider, User.aiModel, User.aiApiKey.
WITH FirstEmailAccount AS (
    SELECT
        "userId",
        "aiProvider",
        "aiModel",
        "aiApiKey",
        ROW_NUMBER() OVER(PARTITION BY "userId" ORDER BY "createdAt" ASC) as rn
    FROM "EmailAccount"
    -- Only consider accounts where at least one setting might exist
    WHERE "aiProvider" IS NOT NULL OR "aiModel" IS NOT NULL OR "aiApiKey" IS NOT NULL
)
UPDATE "User" u
SET
    "aiProvider" = fea."aiProvider",
    "aiModel" = fea."aiModel",
    "aiApiKey" = fea."aiApiKey"
FROM FirstEmailAccount fea
WHERE u.id = fea."userId" AND fea.rn = 1;
