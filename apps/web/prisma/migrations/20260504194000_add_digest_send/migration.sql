-- CreateTable
CREATE TABLE "DigestSend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "resendMessageId" TEXT,
    "itemCount" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "modelUsed" TEXT,
    "narrativeSnapshot" TEXT,
    "digestIds" TEXT[],

    CONSTRAINT "DigestSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigestSend_emailAccountId_date_key" ON "DigestSend"("emailAccountId", "date");

-- CreateIndex
CREATE INDEX "DigestSend_emailAccountId_idx" ON "DigestSend"("emailAccountId");

-- CreateIndex
CREATE INDEX "DigestSend_sentAt_idx" ON "DigestSend"("sentAt");

-- AddForeignKey
ALTER TABLE "DigestSend" ADD CONSTRAINT "DigestSend_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
