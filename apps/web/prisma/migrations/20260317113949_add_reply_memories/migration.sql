-- CreateEnum
CREATE TYPE "ReplyMemoryKind" AS ENUM ('FACT', 'PROCESS', 'PREFERENCE', 'STYLE');

-- CreateEnum
CREATE TYPE "ReplyMemoryScopeType" AS ENUM ('GLOBAL', 'SENDER', 'DOMAIN', 'TOPIC');

-- CreateEnum
CREATE TYPE "ReplyMemoryStatus" AS ENUM ('ACTIVE', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "ReplyMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kind" "ReplyMemoryKind" NOT NULL,
    "scopeType" "ReplyMemoryScopeType" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "status" "ReplyMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ReplyMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyMemoryEvidence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedActionId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sentMessageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "sentText" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ReplyMemoryEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyMemory_emailAccountId_status_updatedAt_idx" ON "ReplyMemory"("emailAccountId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ReplyMemory_emailAccountId_scopeType_scopeValue_idx" ON "ReplyMemory"("emailAccountId", "scopeType", "scopeValue");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_title_key" ON "ReplyMemory"("emailAccountId", "kind", "scopeType", "scopeValue", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyMemoryEvidence_executedActionId_key" ON "ReplyMemoryEvidence"("executedActionId");

-- CreateIndex
CREATE INDEX "ReplyMemoryEvidence_emailAccountId_processedAt_createdAt_idx" ON "ReplyMemoryEvidence"("emailAccountId", "processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ReplyMemoryEvidence_expiresAt_idx" ON "ReplyMemoryEvidence"("expiresAt");

-- AddForeignKey
ALTER TABLE "ReplyMemory" ADD CONSTRAINT "ReplyMemory_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyMemoryEvidence" ADD CONSTRAINT "ReplyMemoryEvidence_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyMemoryEvidence" ADD CONSTRAINT "ReplyMemoryEvidence_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
