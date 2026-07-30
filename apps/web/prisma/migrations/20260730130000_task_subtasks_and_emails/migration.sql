-- Subtasks: one level of nesting on Task
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Task_emailAccountId_parentId_idx" ON "Task"("emailAccountId", "parentId");

-- Emails linked to a task
CREATE TABLE "TaskEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3),
    "taskId" TEXT NOT NULL,

    CONSTRAINT "TaskEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskEmail_taskId_messageId_key" ON "TaskEmail"("taskId", "messageId");

CREATE INDEX "TaskEmail_taskId_createdAt_idx" ON "TaskEmail"("taskId", "createdAt");

ALTER TABLE "TaskEmail" ADD CONSTRAINT "TaskEmail_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
