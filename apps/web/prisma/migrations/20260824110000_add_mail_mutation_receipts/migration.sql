ALTER TABLE "SnoozedThread" ADD COLUMN "clientMutationId" TEXT;
ALTER TYPE "SnoozedThreadStatus" ADD VALUE 'PREPARING' BEFORE 'PENDING';

CREATE TYPE "MailMutationReceiptKind" AS ENUM ('REPLY');
CREATE TYPE "MailMutationReceiptStatus" AS ENUM ('PROCESSING', 'APPLIED', 'UNCERTAIN');

CREATE TABLE "MailMutationReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "kind" "MailMutationReceiptKind" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "MailMutationReceiptStatus" NOT NULL DEFAULT 'PROCESSING',
    "processingStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB,
    "emailAccountId" TEXT NOT NULL,
    CONSTRAINT "MailMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SnoozedThread_emailAccountId_clientMutationId_key" ON "SnoozedThread"("emailAccountId", "clientMutationId");
CREATE UNIQUE INDEX "MailMutationReceipt_emailAccountId_clientMutationId_key" ON "MailMutationReceipt"("emailAccountId", "clientMutationId");
CREATE INDEX "MailMutationReceipt_status_processingStartedAt_idx" ON "MailMutationReceipt"("status", "processingStartedAt");
ALTER TABLE "MailMutationReceipt" ADD CONSTRAINT "MailMutationReceipt_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
