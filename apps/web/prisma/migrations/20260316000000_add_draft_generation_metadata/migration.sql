ALTER TABLE "ExecutedAction"
ADD COLUMN "draftModelProvider" TEXT,
ADD COLUMN "draftModelName" TEXT,
ADD COLUMN "draftPipelineVersion" INTEGER;
