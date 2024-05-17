-- CreateEnum
CREATE TYPE "ColdEmailStatus" AS ENUM ('AI_LABELED_COLD', 'USER_REJECTED_COLD');

-- CreateTable
CREATE TABLE "ColdEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "messageId" TEXT,
    "threadId" TEXT,
    "status" "ColdEmailStatus",
    "reason" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ColdEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ColdEmail_userId_status_idx" ON "ColdEmail"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ColdEmail_userId_fromEmail_key" ON "ColdEmail"("userId", "fromEmail");

-- AddForeignKey
ALTER TABLE "ColdEmail" ADD CONSTRAINT "ColdEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
