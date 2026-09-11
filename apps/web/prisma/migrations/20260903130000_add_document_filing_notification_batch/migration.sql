ALTER TABLE "DocumentFiling"
ADD COLUMN "notificationBatchId" TEXT;

CREATE INDEX "DocumentFiling_emailAccountId_notificationBatchId_idx"
ON "DocumentFiling"("emailAccountId", "notificationBatchId");
