-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "draftDocsUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
