-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MessagingChannel_telegram_active_bot_unique"
ON "MessagingChannel"("provider", "teamId")
WHERE "provider" = 'TELEGRAM'::"MessagingProvider"
  AND "isConnected" = true;
