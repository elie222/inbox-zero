-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_userId_fkey";

-- AddForeignKey
ALTER TABLE "ExecutedRule" ADD CONSTRAINT "ExecutedRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutedRule" ADD CONSTRAINT "ExecutedRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
