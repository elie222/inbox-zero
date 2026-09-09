-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "lastInboxHealthEmailAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailAccount_lastInboxHealthEmailAt_idx" ON "EmailAccount"("lastInboxHealthEmailAt");
