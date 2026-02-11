-- AlterTable
ALTER TABLE "MessagingChannel"
ADD COLUMN "authorizedSenderId" TEXT;

-- CreateTable
CREATE TABLE "MessagingInboundEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" "MessagingProvider" NOT NULL,

    CONSTRAINT "MessagingInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingInboundEvent_provider_createdAt_idx"
ON "MessagingInboundEvent"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_whatsapp_active_phone_unique"
ON "MessagingChannel"("provider", "teamId", "providerUserId")
WHERE "provider" = 'WHATSAPP'::"MessagingProvider"
  AND "isConnected" = true
  AND "providerUserId" IS NOT NULL;
