-- CreateEnum
CREATE TYPE "SenderClassificationEventType" AS ENUM ('LABEL_ADDED', 'LABEL_REMOVED');

-- CreateTable
CREATE TABLE "SenderClassification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender" TEXT NOT NULL,
    "eventType" "SenderClassificationEventType" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "SenderClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SenderClassification_emailAccountId_sender_ruleId_messageId_eventType_key" ON "SenderClassification"("emailAccountId", "sender", "ruleId", "messageId", "eventType");

-- CreateIndex
CREATE INDEX "SenderClassification_emailAccountId_sender_idx" ON "SenderClassification"("emailAccountId", "sender");

-- CreateIndex
CREATE INDEX "SenderClassification_ruleId_idx" ON "SenderClassification"("ruleId");

-- AddForeignKey
ALTER TABLE "SenderClassification" ADD CONSTRAINT "SenderClassification_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderClassification" ADD CONSTRAINT "SenderClassification_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
