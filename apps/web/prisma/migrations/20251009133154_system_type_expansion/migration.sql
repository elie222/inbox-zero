/*
  Warnings:

  - You are about to drop the column `awaitingReplyLabelId` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `coldEmailLabelId` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `needsReplyLabelId` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `outboundReplyTracking` on the `EmailAccount` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "SystemType" ADD VALUE 'FYI';
ALTER TYPE "SystemType" ADD VALUE 'AWAITING_REPLY';
ALTER TYPE "SystemType" ADD VALUE 'ACTIONED';
ALTER TYPE "SystemType" ADD VALUE 'COLD_EMAIL';

-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN "awaitingReplyLabelId",
DROP COLUMN "coldEmailLabelId",
DROP COLUMN "needsReplyLabelId",
DROP COLUMN "outboundReplyTracking";
