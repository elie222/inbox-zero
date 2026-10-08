-- CreateTable
CREATE TABLE "PendingPremiumGrant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "PremiumTier" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "emailAccountsAccess" INTEGER,

    CONSTRAINT "PendingPremiumGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingPremiumGrant_email_key" ON "PendingPremiumGrant"("email");
