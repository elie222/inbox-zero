-- DropIndex
DROP INDEX "Chat_emailAccountId_deletedAt_updatedAt_idx";

-- Remove previously soft-deleted chats before dropping deletedAt.
DELETE FROM "Chat" WHERE "deletedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "Chat"
DROP COLUMN "starred",
DROP COLUMN "deletedAt";

-- CreateIndex
CREATE INDEX "Chat_emailAccountId_updatedAt_idx"
ON "Chat"("emailAccountId", "updatedAt");
