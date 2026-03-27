-- CreateEnum
CREATE TYPE "ClassificationFeedbackEventType" AS ENUM ('LABEL_ADDED', 'LABEL_REMOVED');

-- CreateTable
CREATE TABLE "ClassificationFeedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender" TEXT NOT NULL,
    "eventType" "ClassificationFeedbackEventType" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "ClassificationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationFeedback_emailAccountId_sender_ruleId_messageId_eventType_key" ON "ClassificationFeedback"("emailAccountId", "sender", "ruleId", "messageId", "eventType");

-- CreateIndex
CREATE INDEX "ClassificationFeedback_ruleId_idx" ON "ClassificationFeedback"("ruleId");

-- AddForeignKey
ALTER TABLE "ClassificationFeedback" ADD CONSTRAINT "ClassificationFeedback_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationFeedback" ADD CONSTRAINT "ClassificationFeedback_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
