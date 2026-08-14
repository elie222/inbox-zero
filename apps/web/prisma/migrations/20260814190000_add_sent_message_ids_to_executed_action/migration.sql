ALTER TABLE "ExecutedAction"
ADD COLUMN "executionStartedAt" TIMESTAMP(3),
ADD COLUMN "sentMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "ExecutedAction_sentMessageIds_idx"
ON "ExecutedAction" USING GIN ("sentMessageIds");
