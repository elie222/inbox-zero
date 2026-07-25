-- CreateEnum
CREATE TYPE "ContactInboxPriority" AS ENUM ('OFF', 'ALWAYS', 'AI');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "inboxPriority" "ContactInboxPriority" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "inboxPriorityInstructions" TEXT;
