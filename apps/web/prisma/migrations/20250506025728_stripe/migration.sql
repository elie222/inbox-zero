/*
  Warnings:

  - You are about to drop the column `aiAutomationAccess` on the `Premium` table. All the data in the column will be lost.
  - You are about to drop the column `bulkUnsubscribeAccess` on the `Premium` table. All the data in the column will be lost.
  - You are about to drop the column `coldEmailBlockerAccess` on the `Premium` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `Premium` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `Premium` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionItemId]` on the table `Premium` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PremiumTier" ADD VALUE 'BUSINESS_PLUS_MONTHLY';
ALTER TYPE "PremiumTier" ADD VALUE 'BUSINESS_PLUS_ANNUALLY';

-- AlterEnum
ALTER TYPE "ProcessorType" ADD VALUE 'STRIPE';

-- AlterTable
ALTER TABLE "Premium" DROP COLUMN "aiAutomationAccess",
DROP COLUMN "bulkUnsubscribeAccess",
DROP COLUMN "coldEmailBlockerAccess",
ADD COLUMN     "stripeCancelAtPeriodEnd" BOOLEAN,
ADD COLUMN     "stripeCanceledAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeEndedAt" TIMESTAMP(3),
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeProductId" TEXT,
ADD COLUMN     "stripeRenewsAt" TIMESTAMP(3),
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "stripeSubscriptionItemId" TEXT,
ADD COLUMN     "stripeSubscriptionStatus" TEXT,
ADD COLUMN     "stripeTrialEnd" TIMESTAMP(3);

-- DropEnum
DROP TYPE "FeatureAccess";

-- CreateIndex
CREATE UNIQUE INDEX "Premium_stripeCustomerId_key" ON "Premium"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Premium_stripeSubscriptionId_key" ON "Premium"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Premium_stripeSubscriptionItemId_key" ON "Premium"("stripeSubscriptionItemId");
