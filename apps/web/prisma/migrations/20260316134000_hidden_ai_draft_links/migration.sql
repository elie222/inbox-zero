ALTER TABLE "EmailAccount"
ADD COLUMN "allowHiddenAiDraftLinks" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EmailAccount"
ALTER COLUMN "allowHiddenAiDraftLinks" SET DEFAULT false;
