-- CreateEnum
CREATE TYPE "MessagingProvider" AS ENUM ('SLACK');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "meetingBriefsSendEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MessagingChannel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "providerUserId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "channelId" TEXT,
    "channelName" TEXT,
    "sendMeetingBriefs" BOOLEAN NOT NULL DEFAULT false,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingChannel_emailAccountId_idx" ON "MessagingChannel"("emailAccountId");

-- CreateIndex
CREATE INDEX "MessagingChannel_provider_teamId_idx" ON "MessagingChannel"("provider", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_emailAccountId_provider_teamId_key" ON "MessagingChannel"("emailAccountId", "provider", "teamId");

-- AddForeignKey
ALTER TABLE "MessagingChannel" ADD CONSTRAINT "MessagingChannel_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
