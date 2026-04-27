-- DropIndex
DROP INDEX IF EXISTS "Payment_premiumId_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_premiumId_createdAt_idx" ON "Payment"("premiumId", "createdAt");
