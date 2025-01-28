-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_groupId_fkey";

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
