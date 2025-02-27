-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "premiumId" TEXT,
    "processorType" TEXT NOT NULL,
    "processorId" TEXT,
    "processorSubscriptionId" TEXT,
    "processorCustomerId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "refundedAt" TIMESTAMP(3),
    "refundedAmount" INTEGER,
    "billingReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_processorId_key" ON "Payment"("processorId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_premiumId_fkey" FOREIGN KEY ("premiumId") REFERENCES "Premium"("id") ON DELETE SET NULL ON UPDATE CASCADE;
