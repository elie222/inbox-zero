-- AlterEnum
ALTER TYPE "MessagingRoutePurpose" ADD VALUE 'DIGESTS';
ALTER TYPE "MessagingRoutePurpose" ADD VALUE 'FOLLOW_UPS';

-- AlterTable
ALTER TABLE "EmailAccount"
ADD COLUMN "digestSendEmail" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ThreadTracker"
ADD COLUMN "followUpNotifiedAt" TIMESTAMP(3);
