/*
  Warnings:

  - You are about to drop the column `bccPrompt` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `ccPrompt` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `contentPrompt` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `labelPrompt` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `subjectPrompt` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `toPrompt` on the `Action` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Action" DROP COLUMN "bccPrompt",
DROP COLUMN "ccPrompt",
DROP COLUMN "contentPrompt",
DROP COLUMN "labelPrompt",
DROP COLUMN "subjectPrompt",
DROP COLUMN "toPrompt";
