-- DropForeignKey
ALTER TABLE "DigestItem" DROP CONSTRAINT "DigestItem_actionId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledAction" DROP CONSTRAINT "ScheduledAction_executedActionId_fkey";

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ExecutedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_executedActionId_fkey" FOREIGN KEY ("executedActionId") REFERENCES "ExecutedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
