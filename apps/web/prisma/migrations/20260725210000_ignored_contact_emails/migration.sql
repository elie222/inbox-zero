-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "ignoredContactEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
