-- Rename notificationToken column to notificationMessageId
ALTER TABLE "DocumentFiling" RENAME COLUMN "notificationToken" TO "notificationMessageId";

-- Rename the index (drop old, create new)
DROP INDEX IF EXISTS "DocumentFiling_notificationToken_idx";
CREATE INDEX "DocumentFiling_notificationMessageId_idx" ON "DocumentFiling"("notificationMessageId");

