-- CreateTable
CREATE TABLE "DigestTestRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailAccountId" TEXT NOT NULL,
    "testLabel" TEXT NOT NULL,
    "emailCount" INTEGER NOT NULL,
    "digestIds" TEXT[],

    CONSTRAINT "DigestTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigestTestRun_emailAccountId_createdAt_idx" ON "DigestTestRun"("emailAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "DigestTestRun" ADD CONSTRAINT "DigestTestRun_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
