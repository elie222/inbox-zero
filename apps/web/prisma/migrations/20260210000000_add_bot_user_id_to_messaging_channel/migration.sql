-- AlterTable
ALTER TABLE "MessagingChannel" ADD COLUMN "botUserId" TEXT;

-- Delete all existing Slack connections (fresh start with new auth model)
DELETE FROM "MessagingChannel" WHERE provider = 'SLACK';
