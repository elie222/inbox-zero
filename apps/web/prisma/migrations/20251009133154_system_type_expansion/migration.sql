/*
  Warnings:

  - You are about to drop the column `awaitingReplyLabelId` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `needsReplyLabelId` on the `EmailAccount` table. All the data in the column will be lost.
  - You are about to drop the column `outboundReplyTracking` on the `EmailAccount` table. All the data in the column will be lost.
*/
-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN "awaitingReplyLabelId",
DROP COLUMN "coldEmailLabelId",
DROP COLUMN "needsReplyLabelId",
DROP COLUMN "outboundReplyTracking";
