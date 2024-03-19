-- CreateEnum
CREATE TYPE "ExecutedRuleStatus" AS ENUM ('APPLIED', 'REJECTED', 'PENDING', 'SKIPPED');

-- AlterTable
ALTER TABLE "ExecutedRule" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "status" "ExecutedRuleStatus" NOT NULL DEFAULT 'APPLIED';

-- CreateTable
CREATE TABLE "ExecutedAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "ActionType" NOT NULL,
    "executedRuleId" TEXT NOT NULL,
    "label" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,

    CONSTRAINT "ExecutedAction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExecutedAction" ADD CONSTRAINT "ExecutedAction_executedRuleId_fkey" FOREIGN KEY ("executedRuleId") REFERENCES "ExecutedRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
