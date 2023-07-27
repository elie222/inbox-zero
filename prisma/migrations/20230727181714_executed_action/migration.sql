-- CreateTable
CREATE TABLE "ExecutedAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "action" "Action" NOT NULL,
    "functionName" TEXT NOT NULL,
    "functionArgs" JSONB,
    "automated" BOOLEAN NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExecutedAction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExecutedAction" ADD CONSTRAINT "ExecutedAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
