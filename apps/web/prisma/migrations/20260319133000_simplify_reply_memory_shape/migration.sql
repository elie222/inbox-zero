-- Drop the title/content split for reply memories and keep a single canonical
-- memory payload in content.
ALTER TABLE "ReplyMemory"
DROP CONSTRAINT "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_title_key";

ALTER TABLE "ReplyMemory"
DROP COLUMN "title";

ALTER TABLE "ReplyMemory"
ADD CONSTRAINT "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_content_key"
UNIQUE ("emailAccountId", "kind", "scopeType", "scopeValue", "content");
