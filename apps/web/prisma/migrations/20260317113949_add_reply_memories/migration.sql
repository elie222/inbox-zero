-- CreateEnum
CREATE TYPE "ReplyMemoryKind" AS ENUM ('FACT', 'STYLE');

-- CreateEnum
CREATE TYPE "ReplyMemoryScopeType" AS ENUM ('GLOBAL', 'SENDER', 'DOMAIN', 'TOPIC');

CREATE TABLE "ReplyMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" "ReplyMemoryKind" NOT NULL,
    "scopeType" "ReplyMemoryScopeType" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ReplyMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyMemorySource" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replyMemoryId" TEXT NOT NULL,
    "draftSendLogId" TEXT NOT NULL,

    CONSTRAINT "ReplyMemorySource_pkey" PRIMARY KEY ("replyMemoryId","draftSendLogId")
);

-- CreateIndex
CREATE INDEX "ReplyMemory_emailAccountId_updatedAt_idx" ON "ReplyMemory"("emailAccountId", "updatedAt");

-- CreateIndex
CREATE INDEX "ReplyMemory_emailAccountId_scopeType_scopeValue_idx" ON "ReplyMemory"("emailAccountId", "scopeType", "scopeValue");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_title_key" ON "ReplyMemory"("emailAccountId", "kind", "scopeType", "scopeValue", "title");

-- CreateIndex
CREATE INDEX "ReplyMemorySource_draftSendLogId_idx" ON "ReplyMemorySource"("draftSendLogId");

-- AlterTable
ALTER TABLE "DraftSendLog"
ADD COLUMN "replyMemorySentText" TEXT,
ADD COLUMN "replyMemoryAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "replyMemoryProcessedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DraftSendLog_replyMemoryProcessedAt_replyMemoryAttemptCount_createdAt_idx" ON "DraftSendLog"("replyMemoryProcessedAt", "replyMemoryAttemptCount", "createdAt");

-- AddForeignKey
ALTER TABLE "ReplyMemory" ADD CONSTRAINT "ReplyMemory_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyMemorySource" ADD CONSTRAINT "ReplyMemorySource_replyMemoryId_fkey" FOREIGN KEY ("replyMemoryId") REFERENCES "ReplyMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyMemorySource" ADD CONSTRAINT "ReplyMemorySource_draftSendLogId_fkey" FOREIGN KEY ("draftSendLogId") REFERENCES "DraftSendLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
