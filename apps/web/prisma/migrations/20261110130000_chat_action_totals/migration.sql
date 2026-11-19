-- CreateTable
CREATE TABLE "ChatActionTotal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "ChatActionTotal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatActionTotal_chatId_action_key" ON "ChatActionTotal"("chatId", "action");

-- AddForeignKey
ALTER TABLE "ChatActionTotal" ADD CONSTRAINT "ChatActionTotal_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
