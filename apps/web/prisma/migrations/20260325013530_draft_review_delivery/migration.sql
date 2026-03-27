-- CreateEnum
CREATE TYPE "DraftMaterializationMode" AS ENUM ('MAILBOX_DRAFT', 'MESSAGING_ONLY');

-- CreateEnum
CREATE TYPE "MessagingNotificationEventType" AS ENUM ('OUTBOUND_PROPOSAL_READY');

-- CreateEnum
CREATE TYPE "MessagingNotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboundProposalStatus" AS ENUM ('OPEN', 'PROCESSING', 'SENT', 'DISMISSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutboundProposalCloseReason" AS ENUM ('SUPERSEDED', 'DRAFT_MISSING', 'SENT_EXTERNALLY');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "draftMaterializationMode" "DraftMaterializationMode" NOT NULL DEFAULT 'MAILBOX_DRAFT';

-- CreateTable
CREATE TABLE "OutboundProposal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "OutboundProposalStatus" NOT NULL DEFAULT 'OPEN',
    "closeReason" "OutboundProposalCloseReason",
    "revision" INTEGER NOT NULL DEFAULT 1,
    "materializationMode" "DraftMaterializationMode" NOT NULL,
    "draftId" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT,
    "originalContent" TEXT,
    "currentContent" TEXT,
    "selectedAttachments" JSONB,
    "chatId" TEXT,
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "sentMessageId" TEXT,
    "sentThreadId" TEXT,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "executedActionId" TEXT NOT NULL,
    "messagingChannelId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "OutboundProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "MessagingNotificationEventType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MessagingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingNotificationDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "MessagingNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "chatId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "notificationId" TEXT NOT NULL,
    "messagingChannelId" TEXT NOT NULL,

    CONSTRAINT "MessagingNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingNotificationSubscription" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventType" "MessagingNotificationEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "filters" JSONB,
    "emailAccountId" TEXT NOT NULL,
    "messagingChannelId" TEXT NOT NULL,

    CONSTRAINT "MessagingNotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundProposal_chatId_key" ON "OutboundProposal"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundProposal_executedActionId_key" ON "OutboundProposal"("executedActionId");

-- CreateIndex
CREATE INDEX "OutboundProposal_emailAccountId_status_createdAt_idx" ON "OutboundProposal"("emailAccountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundProposal_emailAccountId_threadId_status_idx" ON "OutboundProposal"("emailAccountId", "threadId", "status");

-- CreateIndex
CREATE INDEX "OutboundProposal_messagingChannelId_status_idx" ON "OutboundProposal"("messagingChannelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingNotification_dedupeKey_key" ON "MessagingNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "MessagingNotification_emailAccountId_eventType_createdAt_idx" ON "MessagingNotification"("emailAccountId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingNotification_sourceType_sourceId_idx" ON "MessagingNotification"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "MessagingNotificationDelivery_status_createdAt_idx" ON "MessagingNotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingNotificationDelivery_messagingChannelId_createdAt_idx" ON "MessagingNotificationDelivery"("messagingChannelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingNotificationDelivery_notificationId_messagingChann_key" ON "MessagingNotificationDelivery"("notificationId", "messagingChannelId");

-- CreateIndex
CREATE INDEX "MessagingNotificationSubscription_emailAccountId_eventType__idx" ON "MessagingNotificationSubscription"("emailAccountId", "eventType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingNotificationSubscription_emailAccountId_messagingC_key" ON "MessagingNotificationSubscription"("emailAccountId", "messagingChannelId", "eventType");

-- AddForeignKey
ALTER TABLE "OutboundProposal" ADD CONSTRAINT "OutboundProposal_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundProposal" ADD CONSTRAINT "OutboundProposal_messagingChannelId_fkey" FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundProposal" ADD CONSTRAINT "OutboundProposal_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingNotification" ADD CONSTRAINT "MessagingNotification_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingNotificationDelivery" ADD CONSTRAINT "MessagingNotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "MessagingNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingNotificationDelivery" ADD CONSTRAINT "MessagingNotificationDelivery_messagingChannelId_fkey" FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingNotificationSubscription" ADD CONSTRAINT "MessagingNotificationSubscription_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingNotificationSubscription" ADD CONSTRAINT "MessagingNotificationSubscription_messagingChannelId_fkey" FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
