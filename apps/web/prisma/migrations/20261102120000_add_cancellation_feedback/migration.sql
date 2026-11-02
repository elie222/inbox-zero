-- CreateTable
CREATE TABLE "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3) NOT NULL,
    "feedback" TEXT,
    "comment" TEXT,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancellationFeedback_stripeCustomerId_idx" ON "CancellationFeedback"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationFeedback_stripeSubscriptionId_canceledAt_key" ON "CancellationFeedback"("stripeSubscriptionId", "canceledAt");
