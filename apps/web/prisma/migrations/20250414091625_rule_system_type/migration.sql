/*
  Warnings:

  - A unique constraint covering the columns `[userId,systemType]` on the table `Rule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('TO_REPLY', 'NEWSLETTER', 'MARKETING', 'CALENDAR', 'RECEIPT', 'NOTIFICATION');

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "systemType" "SystemType";

-- CreateIndex
CREATE UNIQUE INDEX "Rule_userId_systemType_key" ON "Rule"("userId", "systemType");
