-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "aiDraftAutoCleanupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiDraftRetentionDays" INTEGER NOT NULL DEFAULT 14;
