ALTER TABLE "ThreadTracker"
ADD COLUMN "followUpDraftContent" TEXT,
ADD COLUMN "followUpDraftCreatedAt" TIMESTAMP(3);

CREATE INDEX "ThreadTracker_followUpDraft_cleanup_idx"
ON "ThreadTracker"("emailAccountId", "followUpDraftCreatedAt") WHERE ("followUpDraftContent" IS NOT NULL);
