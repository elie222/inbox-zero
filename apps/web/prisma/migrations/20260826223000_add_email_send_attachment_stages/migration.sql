-- Existing PROCESSING rows may already have crossed the provider boundary.
-- Backfill them conservatively before new sends start using a nullable marker
-- for the attachment-preparation phase.
ALTER TABLE "EmailSendOperation" ADD COLUMN "providerStartedAt" TIMESTAMP(3);
UPDATE "EmailSendOperation"
SET "providerStartedAt" = "processingStartedAt";

-- CreateEnum
CREATE TYPE "EmailSendAttachmentStageStatus" AS ENUM ('PENDING', 'READY', 'DELETE_PENDING', 'DELETED');

-- CreateTable
CREATE TABLE "EmailSendAttachmentStage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mutationId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "contentId" TEXT,
    "status" "EmailSendAttachmentStageStatus" NOT NULL DEFAULT 'PENDING',
    "etag" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "EmailSendAttachmentStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendAttachmentStage_pathname_key" ON "EmailSendAttachmentStage"("pathname");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendAttachmentStage_emailAccountId_mutationId_attachmentId_key" ON "EmailSendAttachmentStage"("emailAccountId", "mutationId", "attachmentId");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_emailAccountId_mutationId_idx" ON "EmailSendAttachmentStage"("emailAccountId", "mutationId");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_status_expiresAt_idx" ON "EmailSendAttachmentStage"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_status_updatedAt_idx" ON "EmailSendAttachmentStage"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "EmailSendAttachmentStage" ADD CONSTRAINT "EmailSendAttachmentStage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
