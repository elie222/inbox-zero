-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "sentSignatureScan" JSONB,
ADD COLUMN     "sentSignatureScannedAt" TIMESTAMP(3);
