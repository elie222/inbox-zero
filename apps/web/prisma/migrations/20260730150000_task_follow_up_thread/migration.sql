-- Thread carrying the agent's follow-ups and the assignee's replies
ALTER TABLE "Task" ADD COLUMN "followUpThreadId" TEXT;
