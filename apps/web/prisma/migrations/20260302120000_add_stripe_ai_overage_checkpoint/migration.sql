ALTER TABLE "Premium"
ADD COLUMN "stripeAiOverageLastInvoiceId" TEXT,
ADD COLUMN "stripeAiOverageLastPeriodEnd" TIMESTAMP(3),
ADD COLUMN "stripeAiOverageLastUnits" INTEGER;
