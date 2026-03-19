ALTER TABLE "EmailAccount" ADD COLUMN "learnedWritingStyle" TEXT;

ALTER TABLE "ReplyMemorySource" ADD COLUMN "learnedWritingStyleAnalyzedAt" TIMESTAMP(3);

CREATE INDEX "ReplyMemorySource_replyMemoryId_learnedWritingStyleAnalyzedAt_createdAt_idx"
ON "ReplyMemorySource"("replyMemoryId", "learnedWritingStyleAnalyzedAt", "createdAt");
