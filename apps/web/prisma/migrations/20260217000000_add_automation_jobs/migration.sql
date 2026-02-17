-- CreateEnum
CREATE TYPE "AutomationJobType" AS ENUM ('INBOX_NUDGE', 'INBOX_SUMMARY');

-- CreateEnum
CREATE TYPE "AutomationJobRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "jobType" "AutomationJobType" NOT NULL DEFAULT 'INBOX_NUDGE',
    "prompt" TEXT,
    "cronExpression" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "messagingChannelId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJobRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AutomationJobRunStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "outboundMessage" TEXT,
    "slackMessageTs" TEXT,
    "error" TEXT,
    "automationJobId" TEXT NOT NULL,

    CONSTRAINT "AutomationJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationJob_emailAccountId_enabled_nextRunAt_idx" ON "AutomationJob"("emailAccountId", "enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutomationJob_enabled_nextRunAt_idx" ON "AutomationJob"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutomationJob_messagingChannelId_idx" ON "AutomationJob"("messagingChannelId");

-- CreateIndex
CREATE INDEX "AutomationJob_messagingChannelId_emailAccountId_idx" ON "AutomationJob"("messagingChannelId", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJobRun_automationJobId_scheduledFor_key" ON "AutomationJobRun"("automationJobId", "scheduledFor");

-- CreateIndex
CREATE INDEX "AutomationJobRun_automationJobId_createdAt_idx" ON "AutomationJobRun"("automationJobId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationJobRun_status_createdAt_idx" ON "AutomationJobRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_id_emailAccountId_key" ON "MessagingChannel"("id", "emailAccountId");

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_messagingChannelId_emailAccountId_fkey" FOREIGN KEY ("messagingChannelId", "emailAccountId") REFERENCES "MessagingChannel"("id", "emailAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJobRun" ADD CONSTRAINT "AutomationJobRun_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
