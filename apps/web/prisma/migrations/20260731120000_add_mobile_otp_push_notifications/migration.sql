CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OtpPushNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailAccountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "OtpPushNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");
CREATE UNIQUE INDEX "OtpPushNotification_emailAccountId_messageId_key"
ON "OtpPushNotification"("emailAccountId", "messageId");
CREATE INDEX "OtpPushNotification_createdAt_idx"
ON "OtpPushNotification"("createdAt");

ALTER TABLE "MobilePushToken"
ADD CONSTRAINT "MobilePushToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OtpPushNotification"
ADD CONSTRAINT "OtpPushNotification_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
