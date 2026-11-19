-- CreateEnum
CREATE TYPE "MailSetupState" AS ENUM ('PENDING', 'SUGGESTED', 'DONE');

-- AlterTable
-- Existing accounts get SUGGESTED so the setup card doesn't pop up over a mail
-- client they already use; new accounts default to PENDING.
ALTER TABLE "EmailAccount" ADD COLUMN     "mailDefaultSplitId" TEXT,
ADD COLUMN     "mailSetup" "MailSetupState" NOT NULL DEFAULT 'SUGGESTED';
ALTER TABLE "EmailAccount" ALTER COLUMN "mailSetup" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "MailSplit" ADD COLUMN     "hideFromAll" BOOLEAN NOT NULL DEFAULT false;
