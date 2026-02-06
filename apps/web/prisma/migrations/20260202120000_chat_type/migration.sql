-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('RULES', 'AGENT');

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "type" "ChatType" NOT NULL DEFAULT 'RULES';

-- CreateIndex
CREATE INDEX "Chat_emailAccountId_type_idx" ON "Chat"("emailAccountId", "type");
