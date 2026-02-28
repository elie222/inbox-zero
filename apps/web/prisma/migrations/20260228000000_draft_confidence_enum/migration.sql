-- CreateEnum
CREATE TYPE "DraftReplyConfidence" AS ENUM ('ALL_EMAILS', 'STANDARD', 'HIGH_CONFIDENCE');

-- AlterTable
ALTER TABLE "EmailAccount"
ADD COLUMN "draftReplyConfidence" "DraftReplyConfidence" NOT NULL DEFAULT 'ALL_EMAILS';
