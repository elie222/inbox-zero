-- CreateTable
CREATE TABLE "MailUpload" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA,
    "heldAt" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MailUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailUpload_updatedAt_idx" ON "MailUpload"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailUpload_emailAccountId_blobId_key" ON "MailUpload"("emailAccountId", "blobId");

-- AddForeignKey
ALTER TABLE "MailUpload" ADD CONSTRAINT "MailUpload_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
