-- AlterTable
ALTER TABLE "Premium" ADD COLUMN "lemonSqueezyEventAt" TIMESTAMP(3),
ADD COLUMN "lemonSqueezyEventPriority" INTEGER NOT NULL DEFAULT 0;
