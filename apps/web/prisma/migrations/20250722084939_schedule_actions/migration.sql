-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchedulingStatus" AS ENUM ('PENDING', 'SCHEDULED', 'FAILED');

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "delayInMinutes" INTEGER;

-- CreateTable
CREATE TABLE "ScheduledAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedRuleId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "schedulingStatus" "SchedulingStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "url" TEXT,
    "scheduledId" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedActionId" TEXT,

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAction_executedActionId_key" ON "ScheduledAction"("executedActionId");

-- CreateIndex
CREATE INDEX "ScheduledAction_status_scheduledFor_idx" ON "ScheduledAction"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledAction_emailAccountId_messageId_idx" ON "ScheduledAction"("emailAccountId", "messageId");

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_executedRuleId_fkey" FOREIGN KEY ("executedRuleId") REFERENCES "ExecutedRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
