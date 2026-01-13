-- CreateEnum
CREATE TYPE "DocumentFilingStatus" AS ENUM ('PENDING', 'FILED', 'REJECTED', 'ERROR');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "filingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filingPrompt" TEXT;

-- CreateTable
CREATE TABLE "DriveConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingFolder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "driveConnectionId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "FilingFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFiling" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "fileId" TEXT,
    "reasoning" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" "DocumentFilingStatus" NOT NULL DEFAULT 'FILED',
    "wasAsked" BOOLEAN NOT NULL DEFAULT false,
    "wasCorrected" BOOLEAN NOT NULL DEFAULT false,
    "originalPath" TEXT,
    "correctedAt" TIMESTAMP(3),
    "notificationToken" TEXT NOT NULL,
    "notificationSentAt" TIMESTAMP(3),
    "driveConnectionId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "DocumentFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveConnection_emailAccountId_idx" ON "DriveConnection"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveConnection_emailAccountId_provider_key" ON "DriveConnection"("emailAccountId", "provider");

-- CreateIndex
CREATE INDEX "FilingFolder_driveConnectionId_idx" ON "FilingFolder"("driveConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "FilingFolder_emailAccountId_folderId_key" ON "FilingFolder"("emailAccountId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFiling_notificationToken_key" ON "DocumentFiling"("notificationToken");

-- CreateIndex
CREATE INDEX "DocumentFiling_emailAccountId_status_idx" ON "DocumentFiling"("emailAccountId", "status");

-- CreateIndex
CREATE INDEX "DocumentFiling_driveConnectionId_idx" ON "DocumentFiling"("driveConnectionId");

-- CreateIndex
CREATE INDEX "DocumentFiling_messageId_idx" ON "DocumentFiling"("messageId");

-- CreateIndex
CREATE INDEX "DocumentFiling_notificationToken_idx" ON "DocumentFiling"("notificationToken");

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingFolder" ADD CONSTRAINT "FilingFolder_driveConnectionId_fkey" FOREIGN KEY ("driveConnectionId") REFERENCES "DriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingFolder" ADD CONSTRAINT "FilingFolder_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFiling" ADD CONSTRAINT "DocumentFiling_driveConnectionId_fkey" FOREIGN KEY ("driveConnectionId") REFERENCES "DriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFiling" ADD CONSTRAINT "DocumentFiling_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
