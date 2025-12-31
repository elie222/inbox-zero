-- CreateEnum
CREATE TYPE "PreDraftStatus" AS ENUM ('PENDING', 'CREATED', 'SENT', 'DELETED', 'FAILED');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "preDraftsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailAccount" ADD COLUMN "preDraftsMaxPerDay" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "PreDraft" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "draftId" TEXT,
    "status" "PreDraftStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreDraft_emailAccountId_threadId_key" ON "PreDraft"("emailAccountId", "threadId");

-- CreateIndex
CREATE INDEX "PreDraft_emailAccountId_status_idx" ON "PreDraft"("emailAccountId", "status");

-- AddForeignKey
ALTER TABLE "PreDraft" ADD CONSTRAINT "PreDraft_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
