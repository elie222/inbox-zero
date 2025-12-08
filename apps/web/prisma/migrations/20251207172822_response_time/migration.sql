-- CreateTable
CREATE TABLE "ResponseTime" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "sentMessageId" TEXT NOT NULL,
    "receivedMessageId" TEXT NOT NULL,
    "responseTimeMs" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ResponseTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResponseTime_emailAccountId_sentAt_idx" ON "ResponseTime"("emailAccountId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseTime_emailAccountId_sentMessageId_key" ON "ResponseTime"("emailAccountId", "sentMessageId");

-- AddForeignKey
ALTER TABLE "ResponseTime" ADD CONSTRAINT "ResponseTime_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
