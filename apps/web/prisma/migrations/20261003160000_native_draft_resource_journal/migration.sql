CREATE TYPE "EmailDraftResourceState" AS ENUM ('NOT_CREATED', 'CREATING', 'READY', 'UNCERTAIN', 'CONSUMED');
CREATE TYPE "EmailDraftResourceOwner" AS ENUM ('DRAFT', 'SEND', 'DISCARD');
CREATE TABLE "EmailDraftResource" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "state" "EmailDraftResourceState" NOT NULL DEFAULT 'NOT_CREATED',
  "owner" "EmailDraftResourceOwner" NOT NULL DEFAULT 'DRAFT',
  "sendOperationId" TEXT,
  "providerDraftId" TEXT,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "leaseId" TEXT,
  "leaseStartedAt" TIMESTAMP(3),
  "emailAccountId" TEXT NOT NULL,
  CONSTRAINT "EmailDraftResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailDraftResource_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailDraftResource_emailAccountId_resourceKey_key" ON "EmailDraftResource"("emailAccountId", "resourceKey");
CREATE UNIQUE INDEX "EmailDraftResource_emailAccountId_providerDraftId_key" ON "EmailDraftResource"("emailAccountId", "providerDraftId");
CREATE INDEX "EmailDraftResource_owner_state_updatedAt_idx" ON "EmailDraftResource"("owner", "state", "updatedAt");
CREATE INDEX "EmailDraftResource_emailAccountId_sendOperationId_idx" ON "EmailDraftResource"("emailAccountId", "sendOperationId");

ALTER TABLE "EmailDraftResource" ADD COLUMN "canonicalResourceId" TEXT;
CREATE INDEX "EmailDraftResource_canonicalResourceId_idx" ON "EmailDraftResource"("canonicalResourceId");
ALTER TABLE "EmailDraftResource" ADD CONSTRAINT "EmailDraftResource_canonicalResourceId_fkey"
  FOREIGN KEY ("canonicalResourceId") REFERENCES "EmailDraftResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDraftResource" ADD CONSTRAINT "EmailDraftResource_no_self_alias" CHECK ("canonicalResourceId" IS NULL OR "canonicalResourceId" <> "id");
