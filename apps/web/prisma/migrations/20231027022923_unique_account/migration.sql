-- Only allow one account per user for now. We may remove this constraint in the future
/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "Account"("userId");
