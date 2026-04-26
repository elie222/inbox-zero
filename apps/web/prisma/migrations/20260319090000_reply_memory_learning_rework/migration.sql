ALTER TABLE "EmailAccount" ADD COLUMN "learnedWritingStyle" TEXT;

ALTER TABLE "ReplyMemorySource"
ADD COLUMN "learnedWritingStyleAnalyzedAt" TIMESTAMP(3);

-- Drop the title/content split for reply memories and keep a single canonical
-- memory payload in content.
CREATE TEMP TABLE "_ReplyMemoryDedup" AS
WITH ranked_memories AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY "emailAccountId", "kind", "scopeType", "scopeValue", "content"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS "keeperId",
    ROW_NUMBER() OVER (
      PARTITION BY "emailAccountId", "kind", "scopeType", "scopeValue", "content"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS row_num
  FROM "ReplyMemory"
)
SELECT id, "keeperId"
FROM ranked_memories
WHERE row_num > 1;

INSERT INTO "ReplyMemorySource" (
  "replyMemoryId",
  "draftSendLogId",
  "createdAt",
  "learnedWritingStyleAnalyzedAt"
)
SELECT
  dedup."keeperId",
  source."draftSendLogId",
  source."createdAt",
  source."learnedWritingStyleAnalyzedAt"
FROM "_ReplyMemoryDedup" dedup
JOIN "ReplyMemorySource" source ON source."replyMemoryId" = dedup.id
ON CONFLICT ("replyMemoryId", "draftSendLogId") DO UPDATE
SET
  "createdAt" = LEAST("ReplyMemorySource"."createdAt", EXCLUDED."createdAt"),
  "learnedWritingStyleAnalyzedAt" = CASE
    WHEN "ReplyMemorySource"."learnedWritingStyleAnalyzedAt" IS NULL
      THEN EXCLUDED."learnedWritingStyleAnalyzedAt"
    WHEN EXCLUDED."learnedWritingStyleAnalyzedAt" IS NULL
      THEN "ReplyMemorySource"."learnedWritingStyleAnalyzedAt"
    ELSE LEAST(
      "ReplyMemorySource"."learnedWritingStyleAnalyzedAt",
      EXCLUDED."learnedWritingStyleAnalyzedAt"
    )
  END;

DELETE FROM "ReplyMemory"
WHERE id IN (SELECT id FROM "_ReplyMemoryDedup");

ALTER TABLE "ReplyMemory"
DROP COLUMN "title";

ALTER TYPE "ReplyMemoryKind" RENAME VALUE 'STYLE' TO 'PREFERENCE';

ALTER TYPE "ReplyMemoryKind" ADD VALUE 'PROCEDURE';

ALTER TABLE "ReplyMemory"
ADD COLUMN "isLearnedStyleEvidence" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ReplyMemory"
ADD CONSTRAINT "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_content_key"
UNIQUE ("emailAccountId", "kind", "scopeType", "scopeValue", "content");

CREATE INDEX "ReplyMemorySource_replyMemoryId_learnedWritingStyleAnalyzedAt_createdAt_idx"
ON "ReplyMemorySource"("replyMemoryId", "learnedWritingStyleAnalyzedAt", "createdAt");

DROP TABLE "_ReplyMemoryDedup";
