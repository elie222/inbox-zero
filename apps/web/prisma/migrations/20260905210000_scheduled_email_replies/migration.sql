CREATE TYPE "ScheduledEmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'BLOCKED_AUTH', 'UNCERTAIN', 'FAILED', 'CANCELLED');
CREATE TYPE "EmailReminderStatus" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "threadId" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
    "processingStartedAt" TIMESTAMP(3),
    "executionQueuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "remindAt" TIMESTAMP(3),
    "reminderStatus" "EmailReminderStatus" NOT NULL DEFAULT 'NONE',
    "reminderStartedAt" TIMESTAMP(3),
    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduledEmail_emailAccountId_clientMutationId_key" ON "ScheduledEmail"("emailAccountId", "clientMutationId");
CREATE INDEX "ScheduledEmail_status_sendAt_idx" ON "ScheduledEmail"("status", "sendAt");
CREATE INDEX "ScheduledEmail_reminderStatus_remindAt_idx" ON "ScheduledEmail"("reminderStatus", "remindAt");
CREATE INDEX "ScheduledEmail_emailAccountId_threadId_idx" ON "ScheduledEmail"("emailAccountId", "threadId");
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ScheduledEmail_status_processingStartedAt_idx" ON "ScheduledEmail"("status", "processingStartedAt");
CREATE INDEX "ScheduledEmail_reminderStatus_reminderStartedAt_idx" ON "ScheduledEmail"("reminderStatus", "reminderStartedAt");
