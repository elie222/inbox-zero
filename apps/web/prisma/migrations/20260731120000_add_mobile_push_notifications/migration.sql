CREATE TYPE "MobilePushPlatform" AS ENUM ('android', 'ios');
CREATE TYPE "MobilePushNotificationType" AS ENUM ('otp');

CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "MobilePushPlatform" NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobilePushDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "MobilePushNotificationType" NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "mobilePushTokenId" TEXT NOT NULL,

    CONSTRAINT "MobilePushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");
CREATE UNIQUE INDEX "MobilePushDelivery_type_key_token_key"
ON "MobilePushDelivery"("type", "deduplicationKey", "mobilePushTokenId");
CREATE INDEX "MobilePushDelivery_createdAt_idx"
ON "MobilePushDelivery"("createdAt");
CREATE INDEX "MobilePushDelivery_mobilePushTokenId_idx"
ON "MobilePushDelivery"("mobilePushTokenId");

ALTER TABLE "MobilePushToken"
ADD CONSTRAINT "MobilePushToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDelivery"
ADD CONSTRAINT "MobilePushDelivery_mobilePushTokenId_fkey"
FOREIGN KEY ("mobilePushTokenId") REFERENCES "MobilePushToken"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
