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
    "pageSeenThreadIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimitedUntil" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "chunkToken" TEXT,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "actedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "toolCallId" TEXT NOT NULL,
    "chatId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "BulkInboxActionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkInboxActionJob_chatId_updatedAt_idx" ON "BulkInboxActionJob"("chatId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulkInboxActionJob_emailAccountId_toolCallId_key" ON "BulkInboxActionJob"("emailAccountId", "toolCallId");

-- AddForeignKey
ALTER TABLE "BulkInboxActionJob" ADD CONSTRAINT "BulkInboxActionJob_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkInboxActionJob" ADD CONSTRAINT "BulkInboxActionJob_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

