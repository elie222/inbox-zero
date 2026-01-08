-- DropIndex
DROP INDEX "public"."DocumentFiling_notificationMessageId_idx";

-- RenameIndex
ALTER INDEX "DocumentFiling_notificationToken_key" RENAME TO "DocumentFiling_notificationMessageId_key";
