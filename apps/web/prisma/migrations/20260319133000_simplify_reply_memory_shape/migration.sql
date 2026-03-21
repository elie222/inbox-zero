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
      OR EXCLUDED."learnedWritingStyleAnalyzedAt" IS NULL
      THEN NULL
    ELSE LEAST(
      "ReplyMemorySource"."learnedWritingStyleAnalyzedAt",
      EXCLUDED."learnedWritingStyleAnalyzedAt"
    )
  END;

DELETE FROM "ReplyMemory"
WHERE id IN (SELECT id FROM "_ReplyMemoryDedup");

ALTER TABLE "ReplyMemory"
DROP CONSTRAINT "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_title_key";

ALTER TABLE "ReplyMemory"
DROP COLUMN "title";

ALTER TABLE "ReplyMemory"
ADD CONSTRAINT "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_content_key"
UNIQUE ("emailAccountId", "kind", "scopeType", "scopeValue", "content");

DROP TABLE "_ReplyMemoryDedup";
