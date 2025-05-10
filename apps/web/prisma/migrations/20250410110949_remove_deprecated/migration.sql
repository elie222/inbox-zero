/*
  Warnings:

  - You are about to drop the column `draftReplies` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `draftRepliesInstructions` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `trackReplies` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Rule` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Rule" DROP COLUMN "draftReplies",
DROP COLUMN "draftRepliesInstructions",
DROP COLUMN "trackReplies",
DROP COLUMN "type";
