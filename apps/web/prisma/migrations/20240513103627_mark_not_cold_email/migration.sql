-- AlterEnum
ALTER TYPE "ColdEmailStatus" ADD VALUE 'NOT_COLD_EMAIL';

-- AlterTable
ALTER TABLE "Newsletter" ADD COLUMN     "coldEmailReason" TEXT;

-- CreateIndex
CREATE INDEX "Newsletter_email_coldEmail_idx" ON "Newsletter"("email", "coldEmail");

-- CreateIndex
CREATE INDEX "Newsletter_email_status_idx" ON "Newsletter"("email", "status");
