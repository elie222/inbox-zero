-- CreateEnum
CREATE TYPE "Action" AS ENUM ('ARCHIVE', 'LABEL', 'REPLY', 'SEND_EMAIL', 'FORWARD', 'DRAFT_EMAIL', 'SUMMARIZE', 'MARK_SPAM');

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "instructions" TEXT NOT NULL,
    "actions" "Action"[],
    "extraActionData" JSONB,
    "automate" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
