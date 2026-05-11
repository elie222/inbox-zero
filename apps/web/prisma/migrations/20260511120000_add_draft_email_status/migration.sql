CREATE TYPE "DraftEmailStatus" AS ENUM (
  'PENDING',
  'LIKELY_SENT',
  'REPLIED_WITHOUT_DRAFT',
  'CLEANED_UP_UNUSED',
  'MISSING_FROM_PROVIDER'
);

ALTER TABLE "ExecutedAction"
ADD COLUMN "draftStatus" "DraftEmailStatus";

UPDATE "ExecutedAction"
SET "draftStatus" = CASE
  WHEN "wasDraftSent" = true THEN 'LIKELY_SENT'::"DraftEmailStatus"
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
