-- Attachment metadata cached on linked emails
ALTER TABLE "TaskEmail" ADD COLUMN "attachments" JSONB;

-- Inbound webhook matches new mail to task threads
CREATE INDEX "Task_emailAccountId_followUpThreadId_idx" ON "Task"("emailAccountId", "followUpThreadId");

CREATE INDEX "TaskEmail_threadId_idx" ON "TaskEmail"("threadId");
