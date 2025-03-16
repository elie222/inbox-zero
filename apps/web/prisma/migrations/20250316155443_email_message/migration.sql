-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "from" TEXT NOT NULL,
    "fromDomain" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "toDomain" TEXT NOT NULL,
    "unsubscribeLink" TEXT,
    "read" BOOLEAN NOT NULL,
    "sent" BOOLEAN NOT NULL,
    "draft" BOOLEAN NOT NULL,
    "inbox" BOOLEAN NOT NULL,
    "sizeEstimate" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_userId_threadId_idx" ON "EmailMessage"("userId", "threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_userId_date_idx" ON "EmailMessage"("userId", "date");

-- CreateIndex
CREATE INDEX "EmailMessage_userId_from_idx" ON "EmailMessage"("userId", "from");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_userId_threadId_messageId_key" ON "EmailMessage"("userId", "threadId", "messageId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
