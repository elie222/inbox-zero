-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "lastPolledAt" TIMESTAMP(3);

ALTER TABLE "EmailAccount" ADD COLUMN "fastmailSyncStartedAt" TIMESTAMP(3), ADD COLUMN "fastmailLeaseUntil" TIMESTAMP(3), ADD COLUMN "fastmailLeaseOwner" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN "appPassword" TEXT;
CREATE TABLE "FastmailDraft" (
  "id" TEXT NOT NULL,
  "emailAccountId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FastmailDraft_pkey" PRIMARY KEY ("emailAccountId", "id"),
  CONSTRAINT "FastmailDraft_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FastmailDraft_emailAccountId_messageId_key" ON "FastmailDraft"("emailAccountId", "messageId");
CREATE TABLE "FastmailSyncItem" (
  "emailAccountId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  CONSTRAINT "FastmailSyncItem_pkey" PRIMARY KEY ("emailAccountId", "messageId"),
  CONSTRAINT "FastmailSyncItem_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FastmailSyncItem_emailAccountId_processedAt_idx" ON "FastmailSyncItem"("emailAccountId", "processedAt");

ALTER TABLE "EmailAccount" ADD COLUMN "fastmailResyncState" TEXT, ADD COLUMN "fastmailResyncPosition" TEXT;

ALTER TABLE "Calendar" ADD COLUMN "isReadOnly" BOOLEAN NOT NULL DEFAULT false;
