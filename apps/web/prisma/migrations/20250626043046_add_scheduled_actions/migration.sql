-- CreateEnum
CREATE TYPE IF NOT EXISTS "ScheduledActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');


-- AlterTable
ALTER TABLE "Action" ADD COLUMN IF NOT EXISTS "delayInMinutes" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledAction" (
    "id" TEXT NOT NULL,
    "executedRuleId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "url" TEXT,
    "qstashMessageId" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledAction_executedActionId_key" ON "ScheduledAction"("executedActionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAction_status_scheduledFor_idx" ON "ScheduledAction"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAction_emailAccountId_messageId_idx" ON "ScheduledAction"("emailAccountId", "messageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAction_qstashMessageId_idx" ON "ScheduledAction"("qstashMessageId");

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_executedRuleId_fkey" FOREIGN KEY ("executedRuleId") REFERENCES "ExecutedRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
