-- AlterTable
ALTER TABLE "Chat"
ADD COLUMN "name" TEXT,
ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Chat_emailAccountId_deletedAt_updatedAt_idx"
ON "Chat"("emailAccountId", "deletedAt", "updatedAt");
