-- AlterTable
ALTER TABLE "EmailAccount"
ADD COLUMN "sentMessageOpenTrackingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SentMessageOpen" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT,
    "messageId" TEXT,
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SentMessageOpen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentMessageOpen_token_key" ON "SentMessageOpen"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SentMessageOpen_emailAccountId_messageId_key" ON "SentMessageOpen"("emailAccountId", "messageId");

-- CreateIndex
CREATE INDEX "SentMessageOpen_emailAccountId_threadId_idx" ON "SentMessageOpen"("emailAccountId", "threadId");

-- AddForeignKey
ALTER TABLE "SentMessageOpen" ADD CONSTRAINT "SentMessageOpen_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
