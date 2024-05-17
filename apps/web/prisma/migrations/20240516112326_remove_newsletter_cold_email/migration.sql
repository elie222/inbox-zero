/*
  Warnings:

  - You are about to drop the column `coldEmail` on the `Newsletter` table. All the data in the column will be lost.
  - You are about to drop the column `coldEmailReason` on the `Newsletter` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Newsletter_email_coldEmail_idx";

-- DropIndex
DROP INDEX "Newsletter_email_status_idx";

-- AlterTable
ALTER TABLE "Newsletter" DROP COLUMN "coldEmail",
DROP COLUMN "coldEmailReason";

-- DropEnum
DROP TYPE "ColdEmailStatus";

-- CreateIndex
CREATE INDEX "Newsletter_userId_status_idx" ON "Newsletter"("userId", "status");
