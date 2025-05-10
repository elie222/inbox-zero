-- AlterTable
ALTER TABLE "ExecutedAction" ADD COLUMN     "draftId" TEXT,
ADD COLUMN     "wasDraftSent" BOOLEAN;

-- CreateTable
CREATE TABLE "DraftSendLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedActionId" TEXT NOT NULL,
    "sentMessageId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DraftSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftSendLog_executedActionId_key" ON "DraftSendLog"("executedActionId");

-- CreateIndex
CREATE INDEX "DraftSendLog_executedActionId_idx" ON "DraftSendLog"("executedActionId");

-- AddForeignKey
ALTER TABLE "DraftSendLog" ADD CONSTRAINT "DraftSendLog_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
