-- CreateEnum
CREATE TYPE "PremiumTier" AS ENUM ('PRO_MONTHLY', 'PRO_ANNUALLY', 'BUSINESS_MONTHLY', 'BUSINESS_ANNUALLY', 'LIFETIME');

-- CreateEnum
CREATE TYPE "FeatureAccess" AS ENUM ('UNLOCKED', 'UNLOCKED_WITH_API_KEY', 'LOCKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "premiumId" TEXT;

-- CreateTable
CREATE TABLE "Premium" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lemonSqueezyRenewsAt" TIMESTAMP(3),
    "lemonSqueezyCustomerId" INTEGER,
    "lemonSqueezySubscriptionId" INTEGER,
    "lemonSqueezySubscriptionItemId" INTEGER,
    "lemonSqueezyOrderId" INTEGER,
    "lemonSqueezyProductId" INTEGER,
    "lemonSqueezyVariantId" INTEGER,
    "tier" "PremiumTier",
    "coldEmailBlockerAccess" "FeatureAccess",
    "aiAutomationAccess" "FeatureAccess",
    "emailAccountsAccess" INTEGER,
    "unsubscribeMonth" INTEGER,
    "unsubscribeCredits" INTEGER,
    "aiMonth" INTEGER,
    "aiCredits" INTEGER,

    CONSTRAINT "Premium_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_premiumId_fkey" FOREIGN KEY ("premiumId") REFERENCES "Premium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate User data to Premium

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Migrate data from User to Premium
-- Using the same id for Premium and User only for the initial migration
INSERT INTO "Premium" (
    "id",
    "updatedAt",
    "lemonSqueezyCustomerId",
    "lemonSqueezySubscriptionId",
    "lemonSqueezyRenewsAt",
    "unsubscribeMonth",
    "unsubscribeCredits"
)
SELECT 
    "User".id,
    CURRENT_TIMESTAMP,
    "User"."lemonSqueezyCustomerId",
    CASE 
        WHEN "User"."lemonSqueezySubscriptionId" ~ '^\d+$' THEN CAST("User"."lemonSqueezySubscriptionId" AS INTEGER)
        ELSE NULL 
    END,
    "User"."lemonSqueezyRenewsAt",
    "User"."unsubscribeMonth",
    "User"."unsubscribeCredits"
FROM "User";

-- Step 2: Update User table to set the new premiumId
UPDATE "User"
SET "premiumId" = (
    SELECT "Premium"."id"
    FROM "Premium"
    WHERE "Premium"."id" = "User"."id"
);

DROP EXTENSION "uuid-ossp";
