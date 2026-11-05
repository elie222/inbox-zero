-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "mailBundleInbox" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MailSplit" ADD COLUMN     "bundleInInbox" BOOLEAN NOT NULL DEFAULT false;
