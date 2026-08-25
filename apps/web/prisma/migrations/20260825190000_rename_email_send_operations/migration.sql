ALTER TABLE "MailMutationReceipt" RENAME TO "EmailSendOperation";
ALTER TABLE "EmailSendOperation" RENAME CONSTRAINT "MailMutationReceipt_pkey" TO "EmailSendOperation_pkey";
ALTER TABLE "EmailSendOperation" RENAME CONSTRAINT "MailMutationReceipt_emailAccountId_fkey" TO "EmailSendOperation_emailAccountId_fkey";

ALTER INDEX "MailMutationReceipt_emailAccountId_clientMutationId_key" RENAME TO "EmailSendOperation_emailAccountId_clientMutationId_key";
DROP INDEX "MailMutationReceipt_status_processingStartedAt_idx";

ALTER TYPE "MailMutationReceiptStatus" RENAME TO "EmailSendOperationStatus";
ALTER TYPE "EmailSendOperationStatus" RENAME VALUE 'APPLIED' TO 'SENT';

ALTER TABLE "EmailSendOperation" DROP COLUMN "kind";
DROP TYPE "MailMutationReceiptKind";

CREATE INDEX "EmailSendOperation_status_updatedAt_idx" ON "EmailSendOperation"("status", "updatedAt");
