-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "compactionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChatCompaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "compactedBeforeCreatedAt" TIMESTAMP(3) NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "ChatCompaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "chatId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ChatMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatCompaction_chatId_idx" ON "ChatCompaction"("chatId");

-- CreateIndex
CREATE INDEX "ChatMemory_emailAccountId_idx" ON "ChatMemory"("emailAccountId");

-- AddForeignKey
ALTER TABLE "ChatCompaction" ADD CONSTRAINT "ChatCompaction_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMemory" ADD CONSTRAINT "ChatMemory_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMemory" ADD CONSTRAINT "ChatMemory_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
