CREATE TYPE "DraftEmailStatus" AS ENUM (
  'PENDING',
  'SENT',
  'SENT_WITH_EDITS',
  'REPLIED_WITHOUT_DRAFT',
  'CLEANED_UP_UNUSED',
  'DELETED_OR_GONE'
);

ALTER TABLE "ExecutedAction"
ADD COLUMN "draftStatus" "DraftEmailStatus";

UPDATE "ExecutedAction"
SET "draftStatus" = CASE
  WHEN "wasDraftSent" = true THEN 'SENT'::"DraftEmailStatus"
  WHEN "type" = 'DRAFT_EMAIL' AND "wasDraftSent" = false AND EXISTS (
    SELECT 1
    FROM "DraftSendLog"
    WHERE "DraftSendLog"."executedActionId" = "ExecutedAction"."id"
  ) THEN 'REPLIED_WITHOUT_DRAFT'::"DraftEmailStatus"
  WHEN "type" = 'DRAFT_EMAIL' AND "wasDraftSent" = false THEN 'CLEANED_UP_UNUSED'::"DraftEmailStatus"
  WHEN "type" = 'DRAFT_EMAIL' AND "draftId" IS NOT NULL THEN 'PENDING'::"DraftEmailStatus"
  WHEN "wasDraftSent" = false THEN 'PENDING'::"DraftEmailStatus"
  ELSE NULL
END
WHERE "wasDraftSent" IS NOT NULL OR ("type" = 'DRAFT_EMAIL' AND "draftId" IS NOT NULL);
