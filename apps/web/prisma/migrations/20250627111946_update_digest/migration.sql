/*
  Warnings:

  - You are about to drop the column `digestScheduleId` on the `EmailAccount` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "EmailAccount" DROP CONSTRAINT IF EXISTS "EmailAccount_digestScheduleId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "EmailAccount_digestScheduleId_key";

-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN IF EXISTS "digestScheduleId";
