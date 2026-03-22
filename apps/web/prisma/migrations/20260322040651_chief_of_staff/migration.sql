-- CreateEnum
CREATE TYPE "CosCategory" AS ENUM ('scheduling', 'scheduling_cancel', 'client_parent', 'business', 'urgent', 'notification', 'low_priority');

-- CreateEnum
CREATE TYPE "AutonomyMode" AS ENUM ('auto_handle', 'draft_approve', 'flag_only');

-- CreateEnum
CREATE TYPE "CosVenture" AS ENUM ('smart_college', 'praxis', 'personal');

-- CreateEnum
CREATE TYPE "ProcessedEmailStatus" AS ENUM ('processing', 'completed', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "CosDraftStatus" AS ENUM ('pending', 'approved', 'edited', 'rejected');

-- CreateEnum
CREATE TYPE "CosFilterReason" AS ENUM ('gmail_category', 'blocklist', 'mailing_list', 'bounce', 'shipping', 'batch_summary');

-- CreateEnum
CREATE TYPE "ClientGroupSource" AS ENUM ('auto', 'manual');

-- CreateTable
CREATE TABLE "ChiefOfStaffConfig" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "venture" "CosVenture" NOT NULL,
    "voiceTone" JSONB NOT NULL,
    "signatureHtml" TEXT,
    "signatureLastFetched" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChiefOfStaffConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutonomyLevel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "category" "CosCategory" NOT NULL,
    "mode" "AutonomyMode" NOT NULL,

    CONSTRAINT "AutonomyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosPendingDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slackMessageTs" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "gmailDraftId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "category" "CosCategory" NOT NULL,
    "status" "CosDraftStatus" NOT NULL DEFAULT 'pending',
    "claudeResponse" JSONB NOT NULL,
    "processedEmailId" TEXT,

    CONSTRAINT "CosPendingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "category" "CosCategory",
    "status" "ProcessedEmailStatus" NOT NULL DEFAULT 'processing',
    "failedStage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "actionTaken" TEXT,

    CONSTRAINT "ProcessedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipCache" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientGroupId" TEXT,
    "bookingCount" INTEGER NOT NULL,
    "isVip" BOOLEAN NOT NULL,
    "lastChecked" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "primaryName" TEXT NOT NULL,

    CONSTRAINT "ClientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientGroupMember" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientGroupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ClientGroupSource" NOT NULL,

    CONSTRAINT "ClientGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosFilteredEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT,
    "filterReason" "CosFilterReason" NOT NULL,

    CONSTRAINT "CosFilteredEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,

    CONSTRAINT "ShippingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChiefOfStaffConfig_emailAccountId_key" ON "ChiefOfStaffConfig"("emailAccountId");

-- CreateIndex
CREATE INDEX "ChiefOfStaffConfig_emailAccountId_idx" ON "ChiefOfStaffConfig"("emailAccountId");

-- CreateIndex
CREATE INDEX "AutonomyLevel_emailAccountId_idx" ON "AutonomyLevel"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AutonomyLevel_emailAccountId_category_key" ON "AutonomyLevel"("emailAccountId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CosPendingDraft_slackMessageTs_key" ON "CosPendingDraft"("slackMessageTs");

-- CreateIndex
CREATE UNIQUE INDEX "CosPendingDraft_processedEmailId_key" ON "CosPendingDraft"("processedEmailId");

-- CreateIndex
CREATE INDEX "CosPendingDraft_emailAccountId_idx" ON "CosPendingDraft"("emailAccountId");

-- CreateIndex
CREATE INDEX "CosPendingDraft_status_idx" ON "CosPendingDraft"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_messageId_key" ON "ProcessedEmail"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedEmail_emailAccountId_idx" ON "ProcessedEmail"("emailAccountId");

-- CreateIndex
CREATE INDEX "ProcessedEmail_status_idx" ON "ProcessedEmail"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VipCache_clientEmail_key" ON "VipCache"("clientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ClientGroupMember_email_key" ON "ClientGroupMember"("email");

-- CreateIndex
CREATE INDEX "ClientGroupMember_clientGroupId_idx" ON "ClientGroupMember"("clientGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "CosFilteredEmail_messageId_key" ON "CosFilteredEmail"("messageId");

-- CreateIndex
CREATE INDEX "CosFilteredEmail_emailAccountId_idx" ON "CosFilteredEmail"("emailAccountId");

-- CreateIndex
CREATE INDEX "CosFilteredEmail_createdAt_idx" ON "CosFilteredEmail"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingEvent_messageId_key" ON "ShippingEvent"("messageId");

-- CreateIndex
CREATE INDEX "ShippingEvent_emailAccountId_idx" ON "ShippingEvent"("emailAccountId");

-- AddForeignKey
ALTER TABLE "ChiefOfStaffConfig" ADD CONSTRAINT "ChiefOfStaffConfig_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyLevel" ADD CONSTRAINT "AutonomyLevel_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosPendingDraft" ADD CONSTRAINT "CosPendingDraft_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosPendingDraft" ADD CONSTRAINT "CosPendingDraft_processedEmailId_fkey" FOREIGN KEY ("processedEmailId") REFERENCES "ProcessedEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedEmail" ADD CONSTRAINT "ProcessedEmail_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipCache" ADD CONSTRAINT "VipCache_clientGroupId_fkey" FOREIGN KEY ("clientGroupId") REFERENCES "ClientGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGroupMember" ADD CONSTRAINT "ClientGroupMember_clientGroupId_fkey" FOREIGN KEY ("clientGroupId") REFERENCES "ClientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DraftSendLog_replyMemoryProcessedAt_replyMemoryAttemptCount_cre" RENAME TO "DraftSendLog_replyMemoryProcessedAt_replyMemoryAttemptCount_idx";
