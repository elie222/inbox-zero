-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "watchEmailsSubscriptionHistory" JSONB;
