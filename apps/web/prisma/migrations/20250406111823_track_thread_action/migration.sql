/*
  Warnings:

  - You are about to drop the column `ruleId` on the `ThreadTracker` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'TRACK_THREAD';

-- DropForeignKey
ALTER TABLE "ThreadTracker" DROP CONSTRAINT "ThreadTracker_ruleId_fkey";

-- AlterTable
ALTER TABLE "ThreadTracker" DROP COLUMN "ruleId";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "outboundReplyTracking" BOOLEAN NOT NULL DEFAULT false;
