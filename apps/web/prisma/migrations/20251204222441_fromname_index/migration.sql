-- CreateIndex
CREATE INDEX "EmailMessage_emailAccountId_fromName_idx" ON "EmailMessage"("emailAccountId", "fromName");
