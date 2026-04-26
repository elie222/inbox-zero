-- AlterTable
ALTER TABLE "Premium"
ADD COLUMN     "appleAppAccountToken" TEXT,
ADD COLUMN     "appleEnvironment" TEXT,
ADD COLUMN     "appleExpiresAt" TIMESTAMP(3),
ADD COLUMN     "appleLatestTransactionId" TEXT,
ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "appleProductId" TEXT,
ADD COLUMN     "applePurchaseDate" TIMESTAMP(3),
ADD COLUMN     "appleRevokedAt" TIMESTAMP(3),
ADD COLUMN     "appleSubscriptionGroupIdentifier" TEXT,
ADD COLUMN     "appleSubscriptionStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Premium_appleOriginalTransactionId_key" ON "Premium"("appleOriginalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Premium_appleLatestTransactionId_key" ON "Premium"("appleLatestTransactionId");
