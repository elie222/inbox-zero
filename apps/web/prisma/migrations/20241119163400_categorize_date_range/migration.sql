/*
  Warnings:

  - You are about to drop the column `categorizeEmails` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "categorizeEmails",
ADD COLUMN     "newestCategorizedEmailTime" TIMESTAMP(3),
ADD COLUMN     "oldestCategorizedEmailTime" TIMESTAMP(3);
