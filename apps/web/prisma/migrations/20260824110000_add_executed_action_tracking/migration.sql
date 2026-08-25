ALTER TABLE "ExecutedAction"
ADD COLUMN "executionStartedAt" TIMESTAMP(3),
ADD COLUMN "sentMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
