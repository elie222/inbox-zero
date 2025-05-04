/*
  Warnings:

  - You are about to drop the column `userId` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `CleanupJob` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `CleanupThread` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ColdEmail` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `EmailMessage` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `EmailToken` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ExecutedRule` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Knowledge` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Label` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Newsletter` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ThreadTracker` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_userId_fkey";

-- DropForeignKey
ALTER TABLE "CleanupJob" DROP CONSTRAINT "CleanupJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "CleanupThread" DROP CONSTRAINT "CleanupThread_userId_fkey";

-- DropForeignKey
ALTER TABLE "ColdEmail" DROP CONSTRAINT "ColdEmail_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmailMessage" DROP CONSTRAINT "EmailMessage_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmailToken" DROP CONSTRAINT "EmailToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_userId_fkey";

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_userId_fkey";

-- DropForeignKey
ALTER TABLE "Knowledge" DROP CONSTRAINT "Knowledge_emailAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Knowledge" DROP CONSTRAINT "Knowledge_userId_fkey";

-- DropForeignKey
ALTER TABLE "Label" DROP CONSTRAINT "Label_userId_fkey";

-- DropForeignKey
ALTER TABLE "Newsletter" DROP CONSTRAINT "Newsletter_userId_fkey";

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_userId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadTracker" DROP CONSTRAINT "ThreadTracker_userId_fkey";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "CleanupJob" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "CleanupThread" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "ColdEmail" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "EmailMessage" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "EmailToken" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "ExecutedRule" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "Knowledge" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "Label" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "Newsletter" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "Rule" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "ThreadTracker" DROP COLUMN "userId";

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
