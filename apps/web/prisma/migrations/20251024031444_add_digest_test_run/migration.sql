-- DropForeignKey
ALTER TABLE "DigestTestRun" DROP CONSTRAINT "DigestTestRun_emailAccountId_fkey";

-- DropIndex
DROP INDEX "DigestTestRun_emailAccountId_createdAt_idx";

-- CreateIndex
CREATE INDEX "DigestTestRun_emailAccountId_idx" ON "DigestTestRun"("emailAccountId");

-- CreateIndex
CREATE INDEX "DigestTestRun_createdAt_idx" ON "DigestTestRun"("createdAt");
