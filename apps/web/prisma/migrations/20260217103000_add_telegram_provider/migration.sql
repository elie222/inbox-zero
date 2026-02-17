-- AlterEnum
ALTER TYPE "MessagingProvider" ADD VALUE IF NOT EXISTS 'TELEGRAM';

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_telegram_active_bot_unique"
ON "MessagingChannel"("provider", "teamId")
WHERE "provider" = 'TELEGRAM'::"MessagingProvider"
  AND "isConnected" = true;
