ALTER TABLE "EmailAccount" ADD COLUMN "learnedWritingStyle" TEXT;

ALTER TABLE "ReplyMemory" ADD COLUMN "learnedWritingStyleAnalyzedAt" TIMESTAMP(3);

CREATE INDEX "ReplyMemory_emailAccountId_kind_scopeType_learnedWritingStyleAnalyzedAt_idx"
ON "ReplyMemory"("emailAccountId", "kind", "scopeType", "learnedWritingStyleAnalyzedAt");
