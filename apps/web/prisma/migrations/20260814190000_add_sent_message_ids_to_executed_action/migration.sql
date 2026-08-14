ALTER TABLE "ExecutedAction"
ADD COLUMN "sentMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "ExecutedAction_sentMessageIds_idx"
ON "ExecutedAction" USING GIN ("sentMessageIds");
