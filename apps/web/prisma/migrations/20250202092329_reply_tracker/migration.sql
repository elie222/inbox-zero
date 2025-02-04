-- CreateEnum
CREATE TYPE "ThreadTrackerType" AS ENUM ('AWAITING', 'NEEDS_REPLY', 'NEEDS_ACTION');

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "trackReplies" BOOLEAN;

-- CreateTable
CREATE TABLE "ThreadTracker" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "type" "ThreadTrackerType" NOT NULL,
    "ruleId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ThreadTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadTracker_userId_resolved_idx" ON "ThreadTracker"("userId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadTracker_userId_threadId_messageId_key" ON "ThreadTracker"("userId", "threadId", "messageId");

-- AddForeignKey
ALTER TABLE "ThreadTracker" ADD CONSTRAINT "ThreadTracker_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadTracker" ADD CONSTRAINT "ThreadTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create partial unique index for reply tracking rules
CREATE UNIQUE INDEX "Rule_userId_trackReplies_unique" 
ON "Rule"("userId", "trackReplies") 
WHERE "trackReplies" = true;