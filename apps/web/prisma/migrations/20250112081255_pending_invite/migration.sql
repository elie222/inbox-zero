-- AlterTable
ALTER TABLE "Premium" ADD COLUMN     "pendingInvites" TEXT[];

-- CreateIndex
CREATE INDEX "Premium_pendingInvites_idx" ON "Premium"("pendingInvites");
