/*
  Warnings:

  - This deletes duplicate entries before creating a unique constraint.

*/

-- Delete duplicate entries
DELETE FROM "ExecutedRule"
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, 
      ROW_NUMBER() OVER (
        PARTITION BY "userId", "threadId", "messageId"
        ORDER BY id
      ) AS row_num
    FROM "ExecutedRule"
  ) t
  WHERE t.row_num > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutedRule_userId_threadId_messageId_key" ON "ExecutedRule"("userId", "threadId", "messageId");
