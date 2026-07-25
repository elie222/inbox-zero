-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM ('CREATED', 'NOTE', 'STATUS_CHANGE', 'FOLLOW_UP_SENT', 'REPLY_DETECTED', 'AI_UPDATE');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assigneeEmail" TEXT,
    "sourceThreadId" TEXT,
    "sourceMessageId" TEXT,
    "aiStatusSummary" TEXT,
    "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followUpCadenceDays" INTEGER NOT NULL DEFAULT 3,
    "lastFollowUpAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TaskActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "threadId" TEXT,
    "messageId" TEXT,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_emailAccountId_status_dueAt_idx" ON "Task"("emailAccountId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_emailAccountId_assigneeEmail_idx" ON "Task"("emailAccountId", "assigneeEmail");

-- CreateIndex
CREATE INDEX "Task_followUpEnabled_nextFollowUpAt_idx" ON "Task"("followUpEnabled", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
