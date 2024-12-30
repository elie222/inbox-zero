-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'CALL_WEBHOOK';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "webhookSecret" TEXT;
