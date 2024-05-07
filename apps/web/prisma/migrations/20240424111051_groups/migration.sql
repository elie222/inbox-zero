-- CreateEnum
CREATE TYPE "GroupItemType" AS ENUM ('FROM', 'SUBJECT', 'BODY');

-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_ruleId_fkey";

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "body" TEXT,
ADD COLUMN     "from" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "to" TEXT;

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "groupId" TEXT,
    "type" "GroupItemType" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "GroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_userId_key" ON "Group"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupItem_groupId_type_value_key" ON "GroupItem"("groupId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_groupId_key" ON "Rule"("groupId");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutedRule" ADD CONSTRAINT "ExecutedRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupItem" ADD CONSTRAINT "GroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
