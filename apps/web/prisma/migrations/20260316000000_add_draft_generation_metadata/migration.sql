ALTER TABLE "ExecutedAction"
ADD COLUMN "draftModelProvider" TEXT,
ADD COLUMN "draftModelName" TEXT,
ADD COLUMN "draftPipelineVersion" INTEGER;

UPDATE "ExecutedAction"
SET "draftPipelineVersion" = 1
WHERE "type" = 'DRAFT_EMAIL'
  AND "draftPipelineVersion" IS NULL;
