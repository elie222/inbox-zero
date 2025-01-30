-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_groupId_fkey";

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Delete groups that are not used by any rule
DELETE FROM "Group"
WHERE "id" NOT IN (
    SELECT "groupId"
    FROM "Rule"
    WHERE "groupId" IS NOT NULL
);