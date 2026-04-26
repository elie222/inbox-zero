ALTER TYPE "ActionType" ADD VALUE 'NOTIFY_MESSAGING_CHANNEL';

CREATE TYPE "MessagingMessageStatus" AS ENUM (
  'SENT',
  'DRAFT_SENT',
  'DRAFT_EDITED',
  'DISMISSED',
  'EXPIRED',
  'FAILED'
);

ALTER TABLE "Action"
ADD COLUMN "messagingChannelId" TEXT;

ALTER TABLE "ExecutedAction"
ADD COLUMN "messagingChannelId" TEXT,
ADD COLUMN "messagingMessageId" TEXT,
ADD COLUMN "messagingMessageSentAt" TIMESTAMP(3),
ADD COLUMN "messagingMessageStatus" "MessagingMessageStatus";

ALTER TABLE "Action"
ADD CONSTRAINT "Action_messagingChannelId_fkey"
FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExecutedAction"
ADD CONSTRAINT "ExecutedAction_messagingChannelId_fkey"
FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
