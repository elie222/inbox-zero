-- CreateEnum
CREATE TYPE "SnoozedThreadStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SnoozedThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "threadId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "SnoozedThreadStatus" NOT NULL DEFAULT 'PENDING',
    "schedulingStatus" "SchedulingStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledId" TEXT,
    "executionToken" TEXT,
    "executedAt" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "SnoozedThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnoozedThread_status_scheduledFor_idx" ON "SnoozedThread"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "SnoozedThread_emailAccountId_threadId_status_idx" ON "SnoozedThread"("emailAccountId", "threadId", "status");

-- Only one live restore may exist for a thread. Terminal records remain as history.
CREATE UNIQUE INDEX "SnoozedThread_one_active_per_thread_idx"
ON "SnoozedThread"("emailAccountId", "threadId")
WHERE "status" IN ('PENDING', 'EXECUTING');

-- AddForeignKey
ALTER TABLE "SnoozedThread" ADD CONSTRAINT "SnoozedThread_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
