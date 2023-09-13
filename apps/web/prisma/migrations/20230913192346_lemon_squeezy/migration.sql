-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lemonSqueezyCustomerId" INTEGER,
ADD COLUMN     "lemonSqueezyRenewsAt" TIMESTAMP(3),
ADD COLUMN     "lemonSqueezySubscriptionId" TEXT;
