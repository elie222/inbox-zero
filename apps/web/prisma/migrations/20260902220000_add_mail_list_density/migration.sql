-- CreateEnum
CREATE TYPE "MailListDensity" AS ENUM ('COMPACT', 'EXPANDED');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "mailListDensity" "MailListDensity" NOT NULL DEFAULT 'COMPACT';
