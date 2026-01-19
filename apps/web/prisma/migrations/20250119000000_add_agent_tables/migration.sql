-- CreateEnum
CREATE TYPE "AgentDocumentType" AS ENUM ('MAIN', 'SKILL');

-- CreateEnum
CREATE TYPE "AgentExecutionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "AgentMemoryType" AS ENUM ('FACT', 'PREFERENCE');

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "canLabel" BOOLEAN NOT NULL DEFAULT true,
    "canArchive" BOOLEAN NOT NULL DEFAULT true,
    "canDraftReply" BOOLEAN NOT NULL DEFAULT true,
    "canMarkRead" BOOLEAN NOT NULL DEFAULT true,
    "canWebSearch" BOOLEAN NOT NULL DEFAULT false,
    "canCreateLabel" BOOLEAN NOT NULL DEFAULT false,
    "forwardAllowList" TEXT[],
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "AgentDocumentType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "agentConfigId" TEXT NOT NULL,

    CONSTRAINT "AgentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL,
    "reasoning" TEXT,
    "toolCalls" JSONB,
    "agentConfigId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "AgentMemoryType" NOT NULL,
    "agentConfigId" TEXT NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_emailAccountId_key" ON "AgentConfig"("emailAccountId");

-- CreateIndex
CREATE INDEX "AgentDocument_agentConfigId_type_idx" ON "AgentDocument"("agentConfigId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDocument_agentConfigId_title_key" ON "AgentDocument"("agentConfigId", "title");

-- CreateIndex
CREATE INDEX "AgentExecution_emailAccountId_messageId_idx" ON "AgentExecution"("emailAccountId", "messageId");

-- CreateIndex
CREATE INDEX "AgentExecution_emailAccountId_status_createdAt_idx" ON "AgentExecution"("emailAccountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentExecution_agentConfigId_createdAt_idx" ON "AgentExecution"("agentConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMemory_agentConfigId_type_idx" ON "AgentMemory"("agentConfigId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_agentConfigId_key_key" ON "AgentMemory"("agentConfigId", "key");

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
