/*
  Warnings:

  - Made the column `userId` on table `Category` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "CategoryFilterType" AS ENUM ('INCLUDE', 'EXCLUDE');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "categoryFilterType" "CategoryFilterType";

-- CreateTable
CREATE TABLE "_CategoryToRule" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CategoryToRule_AB_unique" ON "_CategoryToRule"("A", "B");

-- CreateIndex
CREATE INDEX "_CategoryToRule_B_index" ON "_CategoryToRule"("B");

-- AddForeignKey
ALTER TABLE "_CategoryToRule" ADD CONSTRAINT "_CategoryToRule_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToRule" ADD CONSTRAINT "_CategoryToRule_B_fkey" FOREIGN KEY ("B") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
