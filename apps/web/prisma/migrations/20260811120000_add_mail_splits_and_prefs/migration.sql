-- CreateEnum
CREATE TYPE "MailLayout" AS ENUM ('LIST', 'SPLIT');

-- CreateEnum
CREATE TYPE "MailSplitKind" AS ENUM ('ALL', 'UNREAD', 'LABEL', 'CATEGORY');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "mailHintBarDismissed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mailLayout" "MailLayout" NOT NULL DEFAULT 'LIST';

-- CreateTable
CREATE TABLE "MailSplit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MailSplitKind" NOT NULL,
    "value" TEXT,
    "order" INTEGER NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MailSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailSplit_emailAccountId_order_idx" ON "MailSplit"("emailAccountId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MailSplit_emailAccountId_name_key" ON "MailSplit"("emailAccountId", "name");

-- AddForeignKey
ALTER TABLE "MailSplit" ADD CONSTRAINT "MailSplit_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
