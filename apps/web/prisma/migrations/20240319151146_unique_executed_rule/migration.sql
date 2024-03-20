/*
  Warnings:

  - This deletes duplicate entries before creating a unique constraint.

*/

-- Delete duplicate entries
SELECT
  "userId",
  "threadId",
  "messageId",
  COUNT(*)
FROM
  "ExecutedRule"
GROUP BY
  "userId",
  "threadId",
  "messageId"
HAVING
  COUNT(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX "ExecutedRule_userId_threadId_messageId_key" ON "ExecutedRule"("userId", "threadId", "messageId");
