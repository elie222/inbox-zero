/*
  Warnings:

  - A unique constraint covering the columns `[digestFrequencyId]` on the table `EmailAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT');

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'DIGEST';

-- AlterEnum
ALTER TYPE "Frequency" ADD VALUE 'DAILY';

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "coldEmailDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digestFrequencyId" TEXT;

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "DigestStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "actionId" TEXT,
    "coldEmailId" TEXT,

    CONSTRAINT "DigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFrequency" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "intervalDays" INTEGER,
    "occurrences" INTEGER,
    "daysOfWeek" INTEGER,
    "timeOfDay" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,
    "lastOccurrenceAt" TIMESTAMP(3),
    "nextOccurrenceAt" TIMESTAMP(3),

    CONSTRAINT "UserFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Digest_emailAccountId_idx" ON "Digest"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DigestItem_digestId_threadId_messageId_key" ON "DigestItem"("digestId", "threadId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFrequency_emailAccountId_key" ON "UserFrequency"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_digestFrequencyId_key" ON "EmailAccount"("digestFrequencyId");

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "Digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ExecutedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_coldEmailId_fkey" FOREIGN KEY ("coldEmailId") REFERENCES "ColdEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFrequency" ADD CONSTRAINT "UserFrequency_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
