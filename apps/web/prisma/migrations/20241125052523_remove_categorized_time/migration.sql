/*
  Warnings:

  - You are about to drop the column `newestCategorizedEmailTime` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `oldestCategorizedEmailTime` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "newestCategorizedEmailTime",
DROP COLUMN "oldestCategorizedEmailTime";
