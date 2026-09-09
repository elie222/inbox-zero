CREATE TYPE "ExecutedActionStatus" AS ENUM (
  'SUCCEEDED',
  'FAILED',
  'SKIPPED'
);

ALTER TABLE "ExecutedAction"
ADD COLUMN "executionStatus" "ExecutedActionStatus",
ADD COLUMN "executedAt" TIMESTAMP(3),
ADD COLUMN "executionError" JSONB;

CREATE INDEX "ExecutedAction_executionStatus_createdAt_idx"
ON "ExecutedAction"("executionStatus", "createdAt");
