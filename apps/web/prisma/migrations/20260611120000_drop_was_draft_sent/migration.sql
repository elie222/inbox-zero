UPDATE "ExecutedAction"
SET "draftStatus" = 'PENDING'::"DraftEmailStatus"
WHERE "type" = 'DRAFT_EMAIL'
  AND "draftId" IS NOT NULL
  AND "draftStatus" = 'CLEANED_UP_UNUSED'::"DraftEmailStatus"
  AND "wasDraftSent" = false;

ALTER TABLE "ExecutedAction"
DROP COLUMN "wasDraftSent";
