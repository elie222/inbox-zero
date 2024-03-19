/*
  Warnings:

  - A unique constraint covering the columns `[userId,threadId,messageId]` on the table `ExecutedRule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ExecutedRule_userId_threadId_messageId_key" ON "ExecutedRule"("userId", "threadId", "messageId");
