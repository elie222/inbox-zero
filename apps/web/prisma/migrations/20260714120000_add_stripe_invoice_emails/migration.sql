ALTER TABLE "Premium"
ADD COLUMN "stripeInvoiceEmailsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payment"
ADD COLUMN "invoiceEmailSentAt" TIMESTAMP(3);
