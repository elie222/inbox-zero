-- CreateEnum
CREATE TYPE "BulkInboxActionJobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BulkInboxActionJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "BulkInboxActionJobStatus" NOT NULL DEFAULT 'RUNNING',
    "search" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "labelId" TEXT,
    "labelName" TEXT,
    "instruction" TEXT,
    "pageToken" TEXT,
    "rateLimitedUntil" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "chunkToken" TEXT,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "actedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "limitReached" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "confirmationKey" TEXT NOT NULL,
    "chatId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "BulkInboxActionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkInboxActionThread" (
    "jobId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,

    CONSTRAINT "BulkInboxActionThread_pkey" PRIMARY KEY ("jobId","threadId")
);

-- CreateIndex
CREATE INDEX "BulkInboxActionJob_chatId_updatedAt_idx" ON "BulkInboxActionJob"("chatId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulkInboxActionJob_emailAccountId_confirmationKey_key" ON "BulkInboxActionJob"("emailAccountId", "confirmationKey");

-- AddForeignKey
ALTER TABLE "BulkInboxActionJob" ADD CONSTRAINT "BulkInboxActionJob_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkInboxActionJob" ADD CONSTRAINT "BulkInboxActionJob_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkInboxActionThread" ADD CONSTRAINT "BulkInboxActionThread_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkInboxActionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

