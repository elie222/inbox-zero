/*
  Warnings:

  - You are about to drop the column `lemonSqueezyCustomerId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lemonSqueezyRenewsAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lemonSqueezySubscriptionId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `unsubscribeCredits` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `unsubscribeMonth` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "lemonSqueezyCustomerId",
DROP COLUMN "lemonSqueezyRenewsAt",
DROP COLUMN "lemonSqueezySubscriptionId",
DROP COLUMN "unsubscribeCredits",
DROP COLUMN "unsubscribeMonth";
