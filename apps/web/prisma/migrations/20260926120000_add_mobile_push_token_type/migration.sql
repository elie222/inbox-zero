CREATE TYPE "MobilePushTokenType" AS ENUM ('expo', 'apns');

ALTER TABLE "MobilePushToken"
ADD COLUMN "tokenType" "MobilePushTokenType" NOT NULL DEFAULT 'expo';
