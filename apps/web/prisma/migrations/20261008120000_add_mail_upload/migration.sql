-- CreateTable
CREATE TABLE "MailUpload" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "disposition" TEXT,
    "contentId" TEXT,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "stagedAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "heldAt" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MailUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailUpload_storageKey_key" ON "MailUpload"("storageKey");

-- CreateIndex
CREATE INDEX "MailUpload_deletionRequestedAt_idx" ON "MailUpload"("deletionRequestedAt");

-- CreateIndex
CREATE INDEX "MailUpload_updatedAt_idx" ON "MailUpload"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailUpload_emailAccountId_blobId_key" ON "MailUpload"("emailAccountId", "blobId");

-- AddForeignKey
ALTER TABLE "MailUpload" ADD CONSTRAINT "MailUpload_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
