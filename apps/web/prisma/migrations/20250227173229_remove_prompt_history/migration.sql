/*
  Warnings:

  - You are about to drop the `PromptHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PromptHistory" DROP CONSTRAINT "PromptHistory_userId_fkey";

-- DropTable
DROP TABLE "PromptHistory";
