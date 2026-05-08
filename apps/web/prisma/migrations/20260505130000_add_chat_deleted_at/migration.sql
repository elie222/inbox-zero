ALTER TABLE "Chat"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Chat_deletedAt_idx" ON "Chat"("deletedAt");
